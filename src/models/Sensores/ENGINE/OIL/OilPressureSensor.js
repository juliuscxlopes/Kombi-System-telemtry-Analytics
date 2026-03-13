const AlertManager = require('../../../../Redis/Publisher/AlertPublisher');
const publisherService = require('../../../../Redis/Publisher/PublisherService');

class OilPressureHealthModel {
  constructor() {
    this.name = 'OIL_PRESSURE';
    this.LIMITES = {
      CRITICO_BAIXO: 0.5, // Perigo de fundir (Luz do óleo acesa)
      ALERTA_BAIXO: 1.0,   // Baixo para cruzeiro
      IDEAL_MIN: 1.5,
      IDEAL_MAX: 4.5
    };
  }

  analisar(val, isHardwareOk) {
    const pressure = parseFloat(Number(val).toFixed(1));
    const analise = this._processarRegras(pressure, isHardwareOk);

    // 1. Health (Contínuo)
    publisherService.publish('health', this.name, {
      val: pressure,
      label: analise.label,
      status: analise.status,
      severidade: analise.severidade,
      ts: Date.now()
    });

    // 2. Alerts (Se status >= 4)
    if (analise.status >= 4) {
      AlertManager.send('alerts', this.name, {
        nivel: 'CRITICAL',
        msg: `Pressão de Óleo: ${analise.label} (${pressure} BAR)`,
        status: analise.status,
        severidade: analise.severidade,
        ts: Date.now()
      });
    }
  }

  _processarRegras(val, isHardwareOk) {
    if (!isHardwareOk) return { label: 'SENSOR_ERROR', status: 5, severidade: 5 };
    if (val <= this.LIMITES.CRITICO_BAIXO) return { label: 'CRITICA_BAIXA', status: 5, severidade: 5 };
    if (val <= this.LIMITES.ALERTA_BAIXO) return { label: 'BAIXA', status: 4, severidade: 4 };
    return { label: 'NORMAL', status: 2, severidade: 2 };
  }
}

module.exports = OilPressureHealthModel;