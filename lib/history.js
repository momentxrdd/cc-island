const fs = require('fs');
const path = require('path');

const MAX = 300;

class History {
  constructor(fileFn, onChange) {
    this.fileFn = fileFn;
    this.onChange = onChange || (() => {});
    this.items = null;
    this.saveT = null;
  }

  _load() {
    if (this.items) return this.items;
    try { this.items = JSON.parse(fs.readFileSync(this.fileFn(), 'utf8')); } catch { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
    return this.items;
  }

  _save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      try {
        const f = this.fileFn();
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify(this.items));
      } catch {}
    }, 1000);
    this.onChange();
  }

  list() { return this._load(); }

  add(rec) {
    const items = this._load();
    const i = items.findIndex((x) => x.id === rec.id);
    if (i >= 0) items[i] = rec; else items.unshift(rec);
    if (items.length > MAX) items.length = MAX;
    this._save();
  }

  remove(id) {
    const items = this._load();
    const i = items.findIndex((x) => x.id === id);
    if (i >= 0) { items.splice(i, 1); this._save(); }
  }

  clear() { this.items = []; this._save(); }
}

module.exports = { History };
