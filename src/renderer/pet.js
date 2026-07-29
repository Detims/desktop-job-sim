import { Application, Assets, AnimatedSprite, Texture } from 'pixi.js';
import './common.css';
import './pet.css';

const root = document.querySelector('#app');
root.innerHTML = `
  <div id="stage"></div>
  <section id="idleOverlay" class="overlay hidden">
    <strong id="petName">Bob</strong>
    <div>Energy <span id="energy">100</span></div>
    <div>Money <span id="money">$0.00</span></div>
    <button id="management">Open management</button>
  </section>
  <section id="workOverlay" class="work hidden">
    <span id="remaining">30.0s</span>
    <button id="cancel">Cancel</button>
  </section>`;

const idleOverlay = document.querySelector('#idleOverlay');
const workOverlay = document.querySelector('#workOverlay');
const energy = document.querySelector('#energy');
const money = document.querySelector('#money');
const remaining = document.querySelector('#remaining');
const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
let currentState;
let dragging = false;
let previousPoint;
let moved = false;

function renderState(state) {
  currentState = state;
  energy.textContent = String(state.energy);
  money.textContent = formatter.format(state.money);
  document.querySelector('#petName').textContent = state.petName;
  if (state.job) {
    idleOverlay.classList.add('hidden');
    workOverlay.classList.remove('hidden');
    remaining.textContent = `${(state.job.remainingMs / 1000).toFixed(1)}s`;
  } else {
    workOverlay.classList.add('hidden');
  }
}

root.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (!currentState?.job) idleOverlay.classList.toggle('hidden');
});

document.querySelector('#management').addEventListener('click', () => window.desktopPet.openManagement());
document.querySelector('#cancel').addEventListener('click', () => window.desktopPet.cancelJob());

document.querySelector('#stage').addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = true; moved = false; previousPoint = { x: event.screenX, y: event.screenY };
  event.currentTarget.setPointerCapture(event.pointerId);
});
document.querySelector('#stage').addEventListener('pointermove', async (event) => {
  if (!dragging) return;
  const dx = event.screenX - previousPoint.x;
  const dy = event.screenY - previousPoint.y;
  if (dx || dy) { moved = true; await window.desktopPet.moveWindowBy(dx, dy); }
  previousPoint = { x: event.screenX, y: event.screenY };
});
document.querySelector('#stage').addEventListener('pointerup', () => { dragging = false; });

async function initPixi() {
  const app = new Application();
  await app.init({ width: 260, height: 300, backgroundAlpha: 0, antialias: true });
  document.querySelector('#stage').appendChild(app.canvas);
  const sheet = await Assets.load('/assets/bob-spritesheet.json');
  const frames = [0,1,2,3].map(i => Texture.from(`bob-${i}.png`));
  const bob = new AnimatedSprite(frames);
  bob.anchor.set(0.5, 1);
  bob.position.set(130, 288);
  bob.animationSpeed = 12 / 60;
  bob.play();
  app.stage.addChild(bob);
  void sheet;
}

window.desktopPet.onState(renderState);
renderState(await window.desktopPet.getState());
initPixi();
