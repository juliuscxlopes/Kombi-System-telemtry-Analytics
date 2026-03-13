const redis = require('../../Redis/Config/redisConfig');

class Rele {
  constructor(nome) {
    this.nome = nome;
    this.status = 'ABERTO'; 
    this.isHardwareOk = true;
  }

  // Fecha e dispara publicação
  fechar() {
    this.status = 'FECHADO';
    this._publicar('1');
  }

  // Abre e dispara publicação
  abrir() {
    this.status = 'ABERTO';
    this._publicar('0');
  }

  _publicar(sinal) {
    const payload = JSON.stringify({
      c: this.nome,    // Minimalismo no payload (c = componente)
      a: sinal,       // a = acao
      s: this.status, // s = status
      ok: this.isHardwareOk,
      ts: Date.now()
    });

    // Removemos o 'await' aqui. O comando vai para a fila de escrita do ioredis 
    // e o código segue sem esperar o roundtrip do servidor Redis.
    redis.client.xadd('kombi:stream:atuadores', '*', 'data', payload)
      .catch(err => {
        this.isHardwareOk = false;
        console.error(`[🚨] Falha Stream ${this.nome}:`, err.message);
      });
  }
}

module.exports = Rele;

