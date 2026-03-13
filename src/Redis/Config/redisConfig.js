//Analytics/src/DataBase/Redis/Config/redisConfig.js
const Redis = require('ioredis');

class RedisConfig {
  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000), // Reconecta rápido
    });

    // Definição das Streams que o Analytics vai manipular
    this.STREAMS = {
      LOG: 'kombi:stream:log',
      ELECTRIC: 'kombi:stream:electric',
      ENGINE: 'kombi:stream:engine',
      THERMAL: 'kombi:stream:thermal',
      HEALTH: 'kombi:stream:health',
      ALERTS: 'kombi:stream:alerts',
      ACTUATORS: 'kombi:stream:actuators'
    };

    this._initEvents();
  }

  _initEvents() {
    this.client.on('connect', () => console.log('🧠 [REDIS] Analytics conectado ao barramento de dados.'));
    this.client.on('error', (err) => console.error('🚨 [REDIS] Erro no Analytics:', err.message));
  }

  /**
   * Método de leitura contínua (XREAD) para o Worker
   */
  async readStream(stream, lastId = '0', count = 10) {
    try {
      // O Analytics geralmente lê as streams de 'Inteligência' geradas pelo Core
      return await this.client.xread('COUNT', count, 'BLOCK', 1000, 'STREAMS', stream, lastId);
    } catch (err) {
      console.error(`❌ [REDIS] Erro ao ler stream ${stream}:`, err.message);
      return null;
    }
  }

  /**
   * Publica resultados do Analytics (Health/Alerts)
   */
  async publish(stream, sensorName, data) {
    try {
      // Adiciona o sensor e o JSON dos dados na stream de saída
      await this.client.xadd(stream, '*', 'sensor', sensorName, 'data', JSON.stringify(data));
    } catch (err) {
      console.error(`❌ [REDIS] Erro ao publicar em ${stream}:`, err.message);
    }
  }
}

module.exports = new RedisConfig();