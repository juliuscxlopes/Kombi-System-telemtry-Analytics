const healthEvaluator = require('../../services/HealthService/HealthEvaluator');
const publisher = require('../Publisher/PublisherService');
const alertManager = require('../Publisher/AlertPublisher');
const OilTempModel = require('../../models/Sensores/ENGINE/OIL/OilTemperatureSensor');
const OilPressModel = require('../../models/Sensores/ENGINE/OIL/OilPressureSensor');
const RpmModel = require('../../models/Sensores/ENGINE/RPM/RpmSensor');
const VacuumModel = require('../../models/Sensores/ENGINE/VACUUM/VacuumSensor');

class HealthWorker {
  constructor() {
    // 1. Instancia todos os "Especialistas" (Regras de Negócio/Specs)
    this.oilTempModel = new OilTempModel();
    this.oilPressModel = new OilPressModel();
    this.rpmModel = new RpmModel();
    this.vacuumModel = new VacuumModel();

    this.currentBuffer = {
      OIL_TEMP: 0,
      OIL_PRESSURE: 0,
      VACUUM: 0,
      RPM: 0,
      BATTERY: 12.6
    };

    this.lastUpdateTimes = {
      OIL_TEMP: 0,
      OIL_PRESSURE: 0,
      VACUUM: 0, 
      RPM: 0,
      BATTERY: 12.6
    };

    this.nominalCycles = 0; 

    // Novo: Estado de ignição e tentativas
    this.engineState = {
      isWarmStart: false, // Indica se é uma tentativa "quente" (seguida de outra)
      lastAttemptTs: 0,
      consecutiveAttempts: 0
    };
  }

  start() {
      console.log('[🚀] Health Worker Iniciado: Monitorando 100% da Saúde da Kombi...');

      // Inicia a escuta da stream 'engine' sem travar a execução
      // Ele vai alimentar o this._updateBuffer sempre que chegar dado
      publisher.subscribe('engine', (topic, payload) => {
        this._updateBuffer(topic, payload);
      }).catch(err => console.error("Falha Crítica no Subscribe:", err));

      // Este loop de 1s roda em paralelo para processar a saúde
      setInterval(() => {
        this._process();
      }, 1000);
    }

    _processStartupIntelligence() {
    const now = Date.now();
    const { RPM, OIL_PRESSURE } = this.currentBuffer;

    // 1. Detecta tentativa de giro (Motor de arranque puxando ou motor quase pegando)
    // Se o RPM subiu de 0 ou a pressão de óleo deu um "pulo", registramos tentativa
    if (RPM > 50 || OIL_PRESSURE > 0.2) {
      this.engineState.lastAttemptTs = now;
      this.engineState.isWarmStart = true;
    }

    // 2. Expira o estado de "Warm Start" após 30 segundos sem tentativa
    // Se o cara desistiu e voltou 1 minuto depois, volta pro ritual longo
    if (now - this.engineState.lastAttemptTs > 30000) {
      this.engineState.isWarmStart = false;
      this.engineState.consecutiveAttempts = 0;
    }

    return {
      quickStartReady: this.engineState.isWarmStart,
      timeSinceLastAttempt: (now - this.engineState.lastAttemptTs) / 1000
    };
  }

  _updateBuffer(topic, payload) {

    console.log(`[DEBUG] Topic: ${topic} | Raw Payload:`, payload); //DEBUG BRABO
      // 1. Verificamos se o tópico existe no nosso dicionário (Ex: RPM, VACUUM)
      if (this.currentBuffer.hasOwnProperty(topic)) {
        
        // 2. CORREÇÃO: O payload JÁ É o valor (2072, 85.7, etc), não precisa de .val
        this.currentBuffer[topic] = payload; 
        
        this.lastUpdateTimes[topic] = Date.now();
        this.hasNewData = true; 
      }
    }

  _process() {
    try {
      if (!this.hasNewData) return;

      const now = Date.now();
      
      // --- 1. WATCHDOG (Segurança de Dados) ---
      const staleSensors = Object.keys(this.lastUpdateTimes).filter(key => {
        // Ignora battery se ainda não tivermos sensor pra ela, ou checa os 3s
        return this.lastUpdateTimes[key] !== 0 && (now - this.lastUpdateTimes[key]) > 3000;
      });

      if (staleSensors.length > 0) {
        alertManager.send('HEALTH', 'SENSOR_STALE', 4, `Sensores travados: ${staleSensors.join(', ')}`);
      } else {
        alertManager.clear('HEALTH', 'SENSOR_STALE');
      }

      // --- 2. CAMADA DE MODELOS (Análise Individual de Limites) ---
      // Cada especialista analisa o seu dado e gera seus próprios alertas de status 4/5
      this.oilTempModel.analisar(this.currentBuffer.OIL_TEMP, true);
      this.oilPressModel.analisar(this.currentBuffer.OIL_PRESSURE, true);
      this.rpmModel.analisar(this.currentBuffer.RPM, true)
      this.vacuumModel.analisar(this.currentBuffer.VACCUM, true);

      // --- 3. CAMADA DO MAESTRO (Inteligência Cruzada) ---
      // O Evaluator olha o conjunto (Ex: RPM alto + Pressão Baixa = Perigo Total)
      const healthSnapshot = healthEvaluator.evaluate(this.currentBuffer);

      // --- 4. PUBLICAÇÃO DE ESTADO PARA O PRE-ENGINE ---
      // Aqui o Worker "sopra" para o PreEngineService que o caminho está livre
      if (startup.quickStartReady && healthSnapshot.status < 4) {
         // Publica que a saúde está ok e foi uma tentativa rápida
         publisher.publish('engine', 'STATE_CHANGE', { 
           state: 'QUICK_RETRY', 
           ready: true 
         });
      }

      // --- 5. LÓGICA DE LIMPEZA E ESTABILIDADE ---
      if (healthSnapshot.diagnostics.length === 0) {
        this.nominalCycles++;
        if (this.nominalCycles >= 5) {
          alertManager.clearAll('HEALTH');
          this.nominalCycles = 0;
        }
      } else {
        this.nominalCycles = 0;
        console.log(`[🩺] Diagnóstico Crítico: ${healthSnapshot.diagnostics[0].msg}`);
      }

    } catch (err) {
      console.error('[❌] Erro no Processamento de Saúde:', err);
      alertManager.send('HEALTH', 'PROCESS_ERROR', 5, 'Falha no motor de Analytics');
    }
  }
}

module.exports = new HealthWorker();