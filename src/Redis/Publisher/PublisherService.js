//DataBase/Redis/Publisher/PublisherService.js
const redis = require('../Config/redisConfig');

class PublisherService {
  /**
   * Publica dados em streams específicas (engine, health, alerts, etc.)
   * @param {string} streamKey - A chave da stream (ex: 'alerts', 'health')
   * @param {string} topic - O nome do sensor ou ID do alerta (ex: 'RPM', 'SENSOR_STALE')
   * @param {object} payload - O objeto com os dados
   */
  async publish(streamKey, topic, payload) {
    try {
      // Resolve o nome real da stream vindo da config do Redis
      // Se passar 'alerts', ele busca redis.STREAMS.ALERTS ('kombi:stream:alerts')
      const streamName = redis.STREAMS[streamKey.toUpperCase()];

      if (!streamName) {
        throw new Error(`Stream key "${streamKey}" não mapeada no RedisConfig.`);
      }

      // Envia para o Redis
      await redis.publish(streamName, topic, payload);
      
      // Log opcional para debug (desative em produção)
      // console.log(`[📤] Published to ${streamKey}:${topic}`);
      
    } catch (err) {
      console.error(`❌ [PUBLISHER-SERVICE] Erro ao publicar:`, err.message);
    }
  }

/**
   * Escuta ativa da Stream
   */
  async subscribe(streamKey, callback) {
    const streamName = redis.STREAMS[streamKey.toUpperCase()];
    let lastId = '$'; // Começa pegando apenas o que entrar AGORA

    console.log(`[👂] Analytics ouvindo stream: ${streamName}`);

    // Loop de escuta
    while (true) {
      try {

        // XREAD BLOCK 0 espera por novos dados sem timeout
        const results = await redis.client.xread('BLOCK', 0, 'STREAMS', streamName, lastId);

        if (results) {
          const [stream, messages] = results[0];
          for (const message of messages) {
            const [id, fields] = message;
            lastId = id; // Move o cursor para a próxima

            // O Redis entrega os campos como array: ['sensor', 'RPM', 'data', '{...}']
            // fields[1] é o sensor (topic), fields[3] é o JSON (payload)
            const topic = fields[1];
            const payload = JSON.parse(fields[3]);

            callback(topic, payload);
          }
        }
      } catch (err) {
        console.error(`🚨 [SUB-ERROR] Falha na stream ${streamKey}:`, err.message);
      }
    }
  }
}

module.exports = new PublisherService();