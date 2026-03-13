const Rele = require('..');
const redis = require('..');

class PreEngineService {
  constructor() {
    this.ignicao = new Rele('ignicao');
    this.partida = new Rele('partida');
  }

  /**
   * Ritual Completo: O "Bom dia" da Kombi
   */
  async ritualCompleto() {
    console.log("⚡ [PRE-ENGINE] Iniciando Ritual de Partida...");

    // A) FECHA IGNIÇÃO: Alimenta Bobina e Sensores
    this.ignicao.fechar();

    // B) CHECAGEM DE ATALHO (Warm Start)
    // Vamos verificar se o Analytics marcou uma tentativa recente para pular os 5s
    const statsPartida = await this._checarSeJaTeveTentativaRecente();
    
    let tempoEspera = 5000; // Default: 5 segundos

    if (statsPartida.isQuickRetry) {
      tempoEspera = 800; // Apenas 0.8s se for tentativa em sequência (carro a álcool)
      console.log(`⏩ [PRE-ENGINE] Tentativa recente detectada (${statsPartida.lastRPM} RPM). Pulando ritual longo.`);
      
      await redis.client.xadd('kombi:stream:engine', '*', 
        'type', 'PRE_START_DIAGNOSTIC', 
        'payload', JSON.stringify({ status: 'quick_retry', msg: 'Re-tentativa: Partida Rápida Liberada' })
      );
    } else {
      // Feedback normal para a primeira tentativa
      await redis.client.xadd('kombi:stream:engine', '*', 
        'type', 'PRE_START_DIAGNOSTIC', 
        'payload', JSON.stringify({ status: 'running', msg: 'Ritual Completo: Checando Elétrica' })
      );
    }

    // C) JANELA DE ESTABILIZAÇÃO (Dinâmica)
    await new Promise(res => setTimeout(res, tempoEspera));

    // D) VALIDAÇÃO DE SAÚDE INICIAL
    const { isSaudavel, motivo } = await this._validarSaudeInicial();

    if (isSaudavel) {
      await redis.client.xadd('kombi:stream:engine', '*', 
        'type', 'STATE_CHANGE', 
        'data', JSON.stringify({ state: 'PRE_START', ready: true, quick: statsPartida.isQuickRetry })
      );
      
      console.log("🏁 [PRE-ENGINE] Saúde OK. Liberando Solenoide.");
      this.partida.fechar(); 
    } else {
      this.ignicao.abrir();
      alertManager.send('ENGINE', 'START_ABORTED', 5, motivo);
      console.error(`❌ [PRE-ENGINE] Partida abortada: ${motivo}`);
    }
  }

  /**
   * Método Auxiliar para identificar se o motor já tentou girar nos últimos 30s
   */
  async _checarSeJaTeveTentativaRecente() {
    try {
      const logs = await redis.client.xrevrange('kombi:stream:health', '+', '-', 'COUNT', 1);
      if (!logs || logs.length === 0) return { isQuickRetry: false };

      const health = JSON.parse(logs[0][1][1]);
      const agora = Date.now();
      const tempoDesdeUltimaAnalise = agora - health.ts;

      // Se a última análise foi há menos de 30 segundos E o RPM foi > 50 ou Pressão > 0
      // significa que o motor já tentou acordar agorinha.
      const jaTentouGirar = health.current.RPM > 50 || health.current.OIL_PRESSURE > 0.1;
      const dentroDaJanela = tempoDesdeUltimaAnalise < 30000;

      return {
        isQuickRetry: jaTentouGirar && dentroDaJanela,
        lastRPM: health.current.RPM
      };
    } catch (e) {
      return { isQuickRetry: false };
    }
  }

    async _validarSaudeInicial() {
        try {
                // 1. Busca o último SUMMARY postado pelo HealthEvaluator
                const logs = await redis.client.xrevrange('kombi:stream:health', '+', '-', 'COUNT', 1);
                
                if (!logs || logs.length === 0) return false;

                // 2. Extrai o JSON (que é o healthPayload que vimos antes)
                const healthData = JSON.parse(logs[0][1][1]); // Acessa o campo 'data' ou 'SUMMARY'
                
                const { current } = healthData;

                // 3. Critérios de "Go / No-Go" (Voo ou Não-Voo)
                const bateriaOk = current.BATTERY >= 11.5;
                const sensoresOk = current.OIL_PRESSURE !== null && current.OIL_TEMP !== null;

                if (!bateriaOk) console.warn("⚠️ [PRE-ENGINE] Bateria fraca para partida:", current.BATTERY);
                if (!sensoresOk) console.warn("⚠️ [PRE-ENGINE] Falha de leitura nos sensores críticos.");

                return bateriaOk && sensoresOk;

            } catch (err) {
                console.error("❌ [PRE-ENGINE] Erro ao validar saúde:", err);
                return false; // Por segurança, não libera a partida se houver erro no código
            }
        }
    }

module.exports = new PreEngineService();