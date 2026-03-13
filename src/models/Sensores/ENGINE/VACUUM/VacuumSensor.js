//src/models/Sensores/ENGINE/VACUUM/VacuumSensor.js
const AlertManager = require('../../../../Redis/Publisher/AlertPublisher');
const publisherService = require('../../../../Redis/Publisher/PublisherService');

class VacuumHealthModel {
  constructor() {
    this.name = 'VACUUM';
    this.LIMITES = {
      CARGA_ALTA: 5,  // PÉ NO FUNDO (Vácuo some)
      CARGA_MEDIA: 12,
      NOMINAL: 18     // Marcha lenta saudável
    };
  }

  analisar(val, isHardwareOk) {
    const vac = parseFloat(Number(val).toFixed(1));
    const analise = this._processarRegras(vac, isHardwareOk);

    publisherService.publish('health', this.name, {
      val: vac,
      label: analise.label,
      status: analise.status,
      severidade: analise.severidade,
      ts: Date.now()
    });

    if (analise.status >= 4) {
      AlertManager.send('alerts', this.name, {
        nivel: 'INFO', 
        msg: `Carga do Motor: ${analise.label} (${vac} InHg)`,
        status: analise.status,
        severidade: analise.severidade,
        ts: Date.now()
      });
    }
  }

  _processarRegras(val, isHardwareOk) {
    if (!isHardwareOk) return { label: 'SENSOR_ERROR', status: 5, severidade: 5 };
    if (val <= this.LIMITES.CARGA_ALTA) return { label: 'ESFORCO_EXTREMO', status: 4, severidade: 4 };
    return { label: 'NORMAL', status: 2, severidade: 2 };
  }
}

module.exports = VacuumHealthModel;