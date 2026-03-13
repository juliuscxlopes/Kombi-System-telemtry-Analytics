class ServiceCalc {
  constructor() {
    this.history = {}; 
    this.MAX_SAMPLES = 60; // Guardamos 60 segundos para ter um minuto completo
  }

  updateAndAnalyze(key, val) {
    if (!this.history[key]) this.history[key] = [];
    const now = Date.now();
    
    this.history[key].push({ v: val, ts: now });
    if (this.history[key].length > this.MAX_SAMPLES) this.history[key].shift();

    const samples = this.history[key];
    if (samples.length < 2) return null;

    // A) DERIVADA INSTANTÂNEA (Últimos 2 segundos)
    const last = samples[samples.length - 1];
    const prev = samples[samples.length - 2];
    const instantVelocity = (last.v - prev.v) / ((last.ts - prev.ts) / 1000); // variação por segundo

    // B) FEEDBACK DO MINUTO (Janela Completa)
    const first = samples[0];
    const deltaMin = (last.ts - first.ts) / 60000;
    const minuteVelocity = (last.v - first.v) / deltaMin; // variação por minuto

    return {
      current_val: val,
      per_second: parseFloat(instantVelocity.toFixed(3)),
      per_minute: parseFloat(minuteVelocity.toFixed(2)),
      is_stable: Math.abs(minuteVelocity) < 0.2,
      samples_count: samples.length
    };
  }
}

module.exports = new ServiceCalc();