const { ipcRenderer } = require('electron');

// Emulator state
let emulatorRunning = false;
let nostalgist = null;

// GBA button mappings for libretro
const GBA_BUTTONS = {
  A: 8,       // Retropad A
  B: 0,       // Retropad B  
  START: 3,   // Retropad Start
  SELECT: 2,  // Retropad Select
  UP: 4,      // Retropad D-pad Up
  DOWN: 5,    // Retropad D-pad Down
  LEFT: 6,    // Retropad D-pad Left
  RIGHT: 7,   // Retropad D-pad Right
  L: 10,      // Retropad L
  R: 11       // Retropad R
};

// Keyboard mappings
const KEY_MAPPINGS = {
  'ArrowUp': 'UP',
  'ArrowDown': 'DOWN',
  'ArrowLeft': 'LEFT',
  'ArrowRight': 'RIGHT',
  'KeyZ': 'A',
  'KeyX': 'B',
  'Enter': 'START',
  'ShiftLeft': 'SELECT',
  'ShiftRight': 'SELECT',
  'KeyA': 'L',
  'KeyS': 'R'
};

// DOM Elements
const loadRomBtn = document.getElementById('load-rom');
const powerLed = document.getElementById('power-led');
const emulatorCanvas = document.getElementById('emulator-canvas');
const screenOffText = document.getElementById('screen-off-text');

// Button elements
const buttons = {
  UP: document.getElementById('btn-up'),
  DOWN: document.getElementById('btn-down'),
  LEFT: document.getElementById('btn-left'),
  RIGHT: document.getElementById('btn-right'),
  A: document.getElementById('btn-a'),
  B: document.getElementById('btn-b'),
  START: document.getElementById('btn-start'),
  SELECT: document.getElementById('btn-select'),
  L: document.getElementById('btn-l'),
  R: document.getElementById('btn-r')
};

// Track pressed state for buttons
const pressedButtons = new Set();

// Load ROM handler
loadRomBtn.addEventListener('click', async () => {
  try {
    const result = await ipcRenderer.invoke('select-rom');
    if (result) {
      await loadEmulator(result.data, result.name);
    }
  } catch (error) {
    console.error('Error loading ROM:', error);
    alert('Error loading ROM: ' + error.message);
  }
});

// Load and initialize emulator
async function loadEmulator(romData, romName) {
  try {
    screenOffText.textContent = 'Loading emulator...';
    
    // Dynamically import Nostalgist
    const { Nostalgist } = await import('nostalgist');
    
    // Stop existing emulator if running
    if (nostalgist) {
      nostalgist.exit();
      nostalgist = null;
    }
    
    // Create a blob URL from the ROM data
    const romBlob = new Blob([romData]);
    const romUrl = URL.createObjectURL(romBlob);
    
    // Initialize Nostalgist with mGBA core
    nostalgist = await Nostalgist.launch({
      core: 'mgba',
      rom: romUrl,
      canvas: emulatorCanvas,
      runEmulatorManually: false,
      resolveCoreJs: (core) => `https://cdn.jsdelivr.net/gh/nicholasalx/pwa-nicogba/nicogba/libretro-cores/${core}_libretro.js`,
      resolveCoreWasm: (core) => `https://cdn.jsdelivr.net/gh/nicholasalx/pwa-nicogba/nicogba/libretro-cores/${core}_libretro.wasm`,
    });
    
    // Show canvas and hide text
    emulatorCanvas.style.display = 'block';
    screenOffText.style.display = 'none';
    
    // Turn on power LED
    emulatorRunning = true;
    powerLed.classList.add('on');
    
    // Revoke the blob URL after loading
    URL.revokeObjectURL(romUrl);
    
    console.log('Emulator started successfully');
  } catch (error) {
    console.error('Error initializing emulator:', error);
    screenOffText.textContent = 'Error loading: ' + error.message;
    alert('Error initializing emulator: ' + error.message);
  }
}

// Press button handler
function pressButton(buttonName) {
  if (!emulatorRunning || !nostalgist) return;
  
  const buttonIndex = GBA_BUTTONS[buttonName];
  if (buttonIndex !== undefined) {
    nostalgist.pressDown(0, buttonIndex);
    pressedButtons.add(buttonName);
    
    // Visual feedback
    if (buttons[buttonName]) {
      buttons[buttonName].classList.add('pressed');
    }
  }
}

// Release button handler
function releaseButton(buttonName) {
  if (!nostalgist) return;
  
  const buttonIndex = GBA_BUTTONS[buttonName];
  if (buttonIndex !== undefined) {
    nostalgist.pressUp(0, buttonIndex);
    pressedButtons.delete(buttonName);
    
    // Visual feedback
    if (buttons[buttonName]) {
      buttons[buttonName].classList.remove('pressed');
    }
  }
}

// Set up on-screen button event listeners
Object.keys(buttons).forEach(buttonName => {
  const element = buttons[buttonName];
  if (element) {
    // Mouse events
    element.addEventListener('mousedown', (e) => {
      e.preventDefault();
      pressButton(buttonName);
    });
    
    element.addEventListener('mouseup', (e) => {
      e.preventDefault();
      releaseButton(buttonName);
    });
    
    element.addEventListener('mouseleave', () => {
      if (pressedButtons.has(buttonName)) {
        releaseButton(buttonName);
      }
    });
    
    // Touch events for mobile
    element.addEventListener('touchstart', (e) => {
      e.preventDefault();
      pressButton(buttonName);
    });
    
    element.addEventListener('touchend', (e) => {
      e.preventDefault();
      releaseButton(buttonName);
    });
  }
});

// Keyboard event handlers
document.addEventListener('keydown', (e) => {
  const buttonName = KEY_MAPPINGS[e.code];
  if (buttonName && !pressedButtons.has(buttonName)) {
    e.preventDefault();
    pressButton(buttonName);
  }
});

document.addEventListener('keyup', (e) => {
  const buttonName = KEY_MAPPINGS[e.code];
  if (buttonName) {
    e.preventDefault();
    releaseButton(buttonName);
  }
});

// Prevent context menu on right click
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Clean up on window close
window.addEventListener('beforeunload', () => {
  if (nostalgist) {
    nostalgist.exit();
  }
});
