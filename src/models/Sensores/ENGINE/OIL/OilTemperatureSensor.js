// src/models/Sensores/ENGINE/OIL/OilTemperatureSensor.js
const AlertManager = require('../../../../Redis/Publisher/AlertPublisher');
const publisherService = require('../../../../Redis/Publisher/PublisherService');

class OilTemperatureHealthModel {
  constructor() {
    this.name = 'OIL_TEMPERATURE';
    this.LIMITES = {
      FRIO_MAX: 70,
      NOMINAL_MAX: 105,
      QUENTE_ALERTA: 115,
      CRITICO: 125
    };
  }

  analisar(val, isHardwareOk) {
    const temp = parseFloat(Number(val).toFixed(1));
    const analise = this._processarRegras(temp, isHardwareOk);

    // 2. FEED DE ESTADO (HEALTH) 
    // Corrigido: Usando o OBJETO . MÉTODO
    publisherService.publish('health', this.name, {
      val: temp,
      hardware_ok: isHardwareOk,
      label: analise.label,
      status: analise.status,
      ts: Date.now()
    });

    // 3. DISPARO DE ALERTA (ALERTS)
    if (analise.status >= 4) {
      // Corrigido: Usando a variável alertManager que importamos acima
      AlertManager.send(
        'ENGINE', 
        this.name, 
        analise.status, 
        `Temperatura Alta: ${temp}°C - ${analise.label}`
      );
    } else {
      // Limpa o alerta se a temperatura baixar
      AlertManager.clear('ENGINE', this.name);
    }
  }

  _processarRegras(temp, isHardwareOk) {
    if (!isHardwareOk) return { label: 'SENSOR_ERROR', status: 5, severidade: 5 };
    if (temp >= this.LIMITES.CRITICO) return { label: 'EMERGENCIA', status: 5, severidade: 5 };
    if (temp >= this.LIMITES.QUENTE_ALERTA) return { label: 'QUENTE', status: 4, severidade: 4 };
    if (temp <= this.LIMITES.FRIO_MAX) return { label: 'FRIO_AQUECIMENTO', status: 1, severidade: 3 };
    return { label: 'IDEAL', status: 2, severidade: 2 };
  }
}

module.exports = OilTemperatureHealthModel;