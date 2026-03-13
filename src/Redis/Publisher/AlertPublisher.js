//src/Redis/Publisher/AlertPublisher.js
const publisher = require('./PublisherService');

class AlertManager {
  constructor() {
    this.activeAlerts = {}; 
    this.SEVERITY_THRESHOLD = 3; // Só publica se for >= 3 (Amarelo)
  }

  /**
   * Envia ou atualiza um alerta ativo
   */
  send(origin, id, severity, msg, extra = {}) {
    if (severity < this.SEVERITY_THRESHOLD) return;

    const now = Date.now();
    const alertKey = `${origin}_${id}`;
    const isNew = !this.activeAlerts[alertKey];

    // Se o alerta mudou de severidade ou a mensagem mudou, nós publicamos
    if (isNew || this.activeAlerts[alertKey].severity !== severity) {
      
      const alertPayload = {
        type: 'STRIKE', // Indica um alerta ativo
        origin,
        id,
        severity,
        msg,
        val: extra.val || null,
        ts: now
      };

      this.activeAlerts[alertKey] = { severity, msg, lastSent: now };
      publisher.publish('alerts', id, alertPayload);
    }
  }

  /**
   * Resolve um alerta e avisa o front para removê-lo
   */
  clear(origin, id, msg = "Condição normalizada") {
    const alertKey = `${origin}_${id}`;
    
    if (this.activeAlerts[alertKey]) {
      const clearPayload = {
        type: 'CLEAR', // Comando para o Front remover o alerta da tela
        origin,
        id,
        msg: msg,
        ts: Date.now()
      };

      delete this.activeAlerts[alertKey];
      publisher.publish('alerts', id, clearPayload);
    }
  }

  /**
   * Limpa todos os alertas de uma origem (Ex: Reset do motor)
   */
  clearAll(origin) {
    Object.keys(this.activeAlerts).forEach(key => {
      if (key.startsWith(origin)) {
        const id = key.split('_')[1];
        this.clear(origin, id, "Comportamento Nominal: Alertas excluídos.");
      }
    });
  }
}

module.exports = new AlertManager();