// Keyboard and mouse state. The game reads this each frame; tests drive it by
// dispatching real DOM events, so the same path is exercised either way.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.pressed = new Set(); // keys pressed since last frame (edge-triggered)
    this.canvas = canvas;
    this.onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!e.repeat) this.pressed.add(k);
      this.keys.add(k);
    };
    this.onKeyUp = (e) => { this.keys.delete(e.key.toLowerCase()); };
    this.onMouseMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    };
    this.onMouseDown = (e) => { if (e.button === 0) this.mouse.down = true; };
    this.onMouseUp = (e) => { if (e.button === 0) this.mouse.down = false; };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  down(...names) { return names.some((n) => this.keys.has(n)); }
  wasPressed(...names) { return names.some((n) => this.pressed.has(n)); }
  endFrame() { this.pressed.clear(); }
  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
  }
}
