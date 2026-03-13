const AlertManager = require('../../../../Redis/Publisher/AlertPublisher');
const publisherService = require('../../../../Redis/Publisher/PublisherService');

class RpmHealthModel {
  constructor() {
    this.name = 'RPM';
    this.LIMITES = {
      MAX_CRUZEIRO: 3800,
      ALERTA: 4200,
      CORTE: 4500 // Limite de segurança do 1600 original
    };
  }

  analisar(val, isHardwareOk) {

    console.log(`[RPM] Analisando: ${val} RPM | Hardware OK: ${isHardwareOk}`);
      // 1. BLINDAGEM: Se o dado não existe, não processa e não polui o Redis
      if (val === undefined || val === null) {
          // console.log("⚠️ [RPM] Aguardando dado válido...");
          return; 
      }

      // 2. TRATAMENTO: Garante que é número antes de arredondar
      const rpm = Math.round(Number(val));
      
      // 3. PROTEÇÃO: Se por algum motivo o Number falhou (NaN), aborta
      if (isNaN(rpm)) return;

      const analise = this._processarRegras(rpm, isHardwareOk);

      // 4. PUBLICAÇÃO: Agora o 'val' nunca será null aqui
      publisherService.publish('health', this.name, {
        val: rpm,
        label: analise.label,
        status: analise.status,
        severidade: analise.severidade,
        ts: Date.now()
      });

      if (analise.status >= 4) {
        AlertManager.send('alerts', this.name, {
          nivel: rpm >= this.LIMITES.CORTE ? 'CRITICAL' : 'WARNING',
          msg: `Giro do Motor: ${analise.label} (${rpm} RPM)`,
          status: analise.status,
          severidade: analise.severidade,
          ts: Date.now()
        });
      }
    }

  _processarRegras(val, isHardwareOk) {
      if (!isHardwareOk) return { label: 'SENSOR_ERROR', status: 5, severidade: 5 };

      // --- MÁQUINA DE ESTADO DO MOTOR ---
      
      // 1. STANDBY: Chave ligada mas motor parado
      if (val === 0) {
          return { label: 'STANDBY', status: 1, severidade: 1 };
      }

      // 2. CRANKING: O arranque está virando (Momento da partida no álcool)
      // Entre 50 e 400 RPM (abaixo da lenta estável)
      if (val > 0 && val < 450) {
          return { label: 'CRANKING', status: 2, severidade: 1 };
      }

      // 3. SOBREGIRO: Proteção do 1600 original
      if (val >= this.LIMITES.CORTE) {
          return { label: 'SOBREGIRO_CRITICO', status: 5, severidade: 5 };
      }

      // 4. ALERTA: Faixa amarela
      if (val >= this.LIMITES.ALERTA) {
          return { label: 'ALTO_GIRO', status: 4, severidade: 4 };
      }

      // 5. NORMAL: Motor rodando redondo (Lenta ou Cruzeiro)
      return { label: 'RUNNING', status: 2, severidade: 2 };
  }
  
}

module.exports = RpmHealthModel;