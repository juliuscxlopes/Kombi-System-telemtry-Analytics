const publisherService = require('../../Redis/Publisher/PublisherService');
const serviceCalc = require('../Calc/ServiceCalc');
const oilFanActuator = require('../../models/Atuadores/OilFanActuator');
const AlertManager = require('../../Redis/Publisher/AlertPublisher');

/**
 * HealthEvaluator: O Maestro da Telemetria.
 * Cruza dados instantâneos com tendências temporais para diagnósticos preditivos.
 */
class HealthEvaluator {
  constructor() {
    this.name = 'HEALTH_EVALUATOR';
  }

  /**
   * Ponto de entrada principal
   * @param {Object} data - { rpm, vacuum, oil_temp, oil_press, battery }
   */
  evaluate(data) {
    // 1. ATUALIZA O MATEMÁTICO (Obtém velocidades por seg/min)
    const stats = {
      temp: serviceCalc.updateAndAnalyze('OIL_TEMP', data.OIL_TEMP),
      press: serviceCalc.updateAndAnalyze('OIL_PRESS', data.OIL_PRESS),
      vac: serviceCalc.updateAndAnalyze('VACUUM', data.VACUUM),
      rpm: serviceCalc.updateAndAnalyze('RPM', data.RPM)
    };

    const diagnostics = [];

    // 2. EXECUÇÃO DAS REGRAS CRUZADAS (Passando dados e tendências)
    diagnostics.push(this._checkCoolingEfficiency(data.RPM, stats.temp));
    diagnostics.push(this._checkLubricationHealth(stats.TEMP, stats.press));
    diagnostics.push(this._checkEngineLoad(data.RPM, data.VACUUM, stats.vac));
    diagnostics.push(this._checkMechanicalWear(data.RPM, data.OIL_PRESS, stats.press));

    // 3. FILTRAGEM E FEEDBACK NARRATIVO
    const activeDiagnostics = diagnostics.filter(d => d !== null);
    // 3. CÁLCULO DA SOLUÇÃO (Atuador)
    // Passamos o primeiro ID de diagnóstico para o atuador saber o motivo da ação
    const fanAction = oilFanActuator.calculate(
      data.oil_temp, 
      stats.temp?.per_minute || 0, 
      activeDiagnostics[0]?.id || null
    );

    const minuteFeedback = this._generateMinuteFeedback(stats.temp, stats.press);

    // 4. PAYLOAD DE SAÚDE COMPLETO (O "Veredito")
    const healthPayload = {
      current: data,                // Snapshot atual
      trends: stats,                // Velocidades por seg/min
      diagnostics: activeDiagnostics, // Problemas detectados
      actuators: {
        oil_fan: fanAction // Agora o estado do atuador faz parte da saúde
      }, 
      feedback: minuteFeedback,     // Texto narrativo para o motorista
      ts: Date.now()
    };

    // 5. PUBLICAÇÃO DUPLA (Health para histórico/painel e Alerts para emergência)
    this._publish(healthPayload);

    return healthPayload;
  }

  /**
   * REGRA 1: EFICIÊNCIA TÉRMICA (Cruza RPM vs Velocidade de Aquecimento)
   */
  _checkCoolingEfficiency(rpm, tStats) {
    if (!tStats) return null;

    // Se o giro está alto (>3200) e a temperatura sobe mais de 2°C/min
    if (rpm > 3200 && tStats.per_minute > 2.0) {
      return {
        id: 'THERMAL_INEFFICIENCY',
        severity: 4,
        msg: `Aquecimento crítico em alta rotação (+${tStats.per_minute}°C/min). Verifique ventilação.`
      };
    }
    return null;
  }
  /**
   * REGRA 2: AQUECIMENTO RÁPIDO (Tendência de temperatura de oleo por minuto)
   */

  _checkThermalTrend(tStats) {
  if (tStats.per_minute > 3.0) { // Subindo mais de 3 graus por minuto
    return {
      id: 'FAST_HEATING',
      severity: 3,
      msg: "Aquecimento rápido de Óleo detectado. Iniciando pré-resfriamento."
    };
  }
    return null;
  }

  /**
   * REGRA 2: SAÚDE DA LUBRIFICAÇÃO (Cruza Temp vs Pressão Instantânea)
   */
  _checkLubricationHealth(tStats, pStats) {
    if (!tStats || !pStats) return null;

    // Se a temperatura está estável mas a pressão cai rápido por segundo
    if (tStats.is_stable && pStats.per_second < -0.2) {
      return {
        id: 'SUDDEN_PRESSURE_DROP',
        severity: 5,
        msg: "Queda abrupta de pressão com temperatura estável! Possível vazamento ou falha de bomba."
      };
    }
    return null;
  }

  /**
   * REGRA 3: DIAGNÓSTICO DE CARGA (RPM vs Vácuo vs Estabilidade do Vácuo)
   */
  _checkEngineLoad(rpm, vacValue, vStats) {
    if (!vStats) return null;

    // Se o vácuo oscila muito (per_second instável) na lenta
    if (rpm < 1100 && Math.abs(vStats.per_second) > 1.0) {
      return {
        id: 'UNSTABLE_IDLE',
        severity: 3,
        msg: "Vácuo instável na lenta. Verifique entrada de ar falsa ou ignição."
      };
    }
    return null;
  }

  /**
   * REGRA 4: DESGASTE MECÂNICO (Tendência de Pressão vs Giro)
   */
  _checkMechanicalWear(rpm, pressValue, pStats) {
    // Se em cruzeiro (3000 RPM) a pressão está abaixo de 1.5 e caindo no minuto
    if (rpm > 3000 && pressValue < 1.5 && pStats.per_minute < 0) {
      return {
        id: 'WEAR_PROGRESSION',
        severity: 4,
        msg: "Pressão de cruzeiro insuficiente e com tendência de queda. Óleo pode estar perdendo viscosidade."
      };
    }
    return null;
  }

  /**
   * FEEDBACK NARRATIVO: Traduz os números para o humano
   */
  _generateMinuteFeedback(tStats, pStats) {
    if (!tStats || tStats.samples_count < 30) return "Monitorando tendências...";

    if (tStats.per_minute > 2.5) return "Motor em aquecimento rápido. Evite carga total.";
    if (pStats?.per_minute < -0.2) return "Alerta: Pressão de óleo perdendo terreno no último minuto.";
    if (tStats.is_stable) return "Operação térmica estabilizada.";

    return "Sistemas operando dentro da normalidade.";
  }

  _publish(payload) {
    // Publicação para o Cérebro/Dashboard
    publisherService.publish('health', 'SUMMARY', payload);

    // Se houver diagnóstico de alta severidade, publica no Alerta
    payload.diagnostics.forEach(diag => {
      if (diag.severity >= 4) {
        AlertManager.send('alerts', diag.id, { ...diag, ts: Date.now() });
      }
    });
  }
}

module.exports = new HealthEvaluator();