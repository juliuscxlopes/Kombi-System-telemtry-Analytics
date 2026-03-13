require('dotenv').config();
const healthWorker = require('./src/Redis/worker/WorkerHealth');
const redis = require('./src/Redis/Config/redisConfig');

async function bootstrap() {
  try {
    console.log("🧠 [SYSTEM] Iniciando Cérebro Analytics - Kombi System");
    console.log("--------------------------------------------------");

    await redis.client.ping();
    console.log("✅ [REDIS] Conexão estabelecida com sucesso.");

    // 2. Inicia o Worker de Saúde
    // Ele vai assinar a stream 'engine' e rodar o loop de processamento de 1s
    healthWorker.start();

    // 3. Tratamento de Encerramento (Graceful Shutdown)
    // Se você der Ctrl+C, limpamos os intervalos e fechamos conexões
    process.on('SIGINT', async () => {
      console.log("\n🛑 [SYSTEM] Desligando Analytics...");
      // Se houver intervalos no healthWorker, você pode criar um método stop()
      process.exit(0);
    });

    console.log("🏁 [SYSTEM] Analytics operando. Monitorando Streams de Inteligência...");

  } catch (err) {
    console.error("❌ [FATAL] Erro ao iniciar Analytics:", err);
    process.exit(1);
  }
}

bootstrap();