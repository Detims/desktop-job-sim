import './common.css';
import './management.css';

const root = document.querySelector('#app');
root.innerHTML = `
  <main>
    <p class="eyebrow">DESKTOP PET</p>
    <h1 id="name">Bob</h1>
    <button id="start">Start 30-second job</button>
    <p id="status">Ready</p>
    <p class="hint">Test shortcut: Ctrl+Shift+E sets energy to 0.05.</p>
  </main>`;
const start = document.querySelector('#start');
const status = document.querySelector('#status');

function render(state) {
  document.querySelector('#name').textContent = state.petName;
  start.disabled = Boolean(state.job) || state.energy <= 0;
  status.textContent = state.job ? `Working — ${(state.job.remainingMs / 1000).toFixed(1)} seconds left` : 'Ready';
}
start.addEventListener('click', () => window.desktopPet.startJob());
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyE') window.desktopPet.setEnergyNearZero();
});
window.desktopPet.onState(render);
render(await window.desktopPet.getState());
