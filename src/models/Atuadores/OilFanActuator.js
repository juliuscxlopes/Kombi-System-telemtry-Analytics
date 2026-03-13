const AlertManager = require('../../Redis/Publisher/AlertPublisher');
const publisherService = require('../../Redis/Publisher/PublisherService');

class OilFanActuatorModel {
  constructor() {
    this.name = 'OIL_FAN_ACTUATOR';
    this.TARGET_TEMP = 90.0;
    this.MIN_PWM = 15;
    this.MAX_PWM = 100;
    
    this.integralAccumulator = 0;
    this.lastPower = -1; // Força a primeira publicação
    this.status = 'IDLE';
  }

  calculate(currentTemp, tempTrend, diagnosticId) {
    const error = currentTemp - this.TARGET_TEMP;
    
    if (currentTemp <= this.TARGET_TEMP && tempTrend <= 0.5) {
      this._reset();
      return this._output(0, 'Sistemas nominais. Ventoinha em repouso.');
    }

    let pTerm = error > 0 ? error * 4 : 0;
    let dTerm = tempTrend > 0 ? tempTrend * 5 : 0;

    if (error > 0) {
      this.integralAccumulator += 0.5; 
    } else {
      this.integralAccumulator -= 1.0;
    }
    
    this.integralAccumulator = Math.min(50, Math.max(0, this.integralAccumulator));
    let totalPower = pTerm + dTerm + this.integralAccumulator;

    let finalPower = Math.round(totalPower);
    if (finalPower > 0 && finalPower < this.MIN_PWM) finalPower = this.MIN_PWM;
    if (finalPower > this.MAX_PWM) finalPower = this.MAX_PWM;

    this.status = finalPower > 80 ? 'EMERGENCY' : 'ACTIVE';
    const reason = this._getReason(diagnosticId, tempTrend);

    const result = this._output(finalPower, reason);
    this.lastPower = finalPower; // Atualiza o cache depois de publicar
    return result;
  }

  _getReason(diagId, trend) {
    if (diagId === 'THERMAL_INEFFICIENCY') return "Falha de troca térmica detectada. Forçando ventoinha.";
    if (trend > 3) return `Aquecimento agressivo (+${trend}°C/min). Antecipando solução.`;
    return "Manutenção de temperatura alvo (PID).";
  }

  _reset() {
    this.integralAccumulator = 0;
    this.status = 'IDLE';
  }

  _output(power, reason) {
    const payload = {
      atuador: 'OIL_FAN',
      val: power,
      status: this.status,
      integral: parseFloat(this.integralAccumulator.toFixed(2)),
      reason: reason,
      ts: Date.now()
    };

    // Só publica se houver mudança real na potência
    if (power !== this.lastPower) {
      // 1. Comando Real para o Hardware
      publisherService.publish('actuators', 'OIL_FAN_CONTROL', payload);

      // 2. Stream ELECTRIC: Monitoramento de carga/consumo
      publisherService.publish('electric', 'OIL_FAN', {
        active: power > 0,
        load_percent: power,
        status: power > 0 ? 'OPERATIONAL' : 'OFF',
        ts: Date.now()
      }, true);

      // 3. Stream ALERT: O log de inteligência/ação
      if (power > 0) {
        AlertManager.send('alerts', 'ACTUATOR_ACTION', {
          nivel: power > 80 ? 'CRITICAL' : 'INFO',
          msg: `Ventoinha de Óleo: ${power}% - ${reason}`,
          atuador: 'OIL_FAN',
          val: power,
          ts: Date.now()
        });
      }
    }

    return payload;
  }
}

module.exports = new OilFanActuatorModel();