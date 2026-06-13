"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  persistSram,
  loadPersistedSram,
  uint8ArraysEqual,
} from "@/lib/emulator-storage";

// GBA button mappings for libretro
const GBA_BUTTONS = {
  A: 8,
  B: 0,
  START: 3,
  SELECT: 2,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
  L: 10,
  R: 11,
};

// Keyboard mappings
const KEY_MAPPINGS: Record<string, keyof typeof GBA_BUTTONS> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  KeyZ: "A",
  KeyX: "B",
  Enter: "START",
  ShiftLeft: "SELECT",
  ShiftRight: "SELECT",
  KeyA: "L",
  KeyS: "R",
};

const SRAM_POLL_MS = 10_000;

// Cartridge data models
interface Cartridge {
  id: string;
  name: string;
  romFile: string;
  gameId: string; // for SRAM persistence
  type: "SCRLBOY"
  colorStyle: {
    bodyGradient: string;
    labelGloss: string;
    textureOverlay: string;
    borderAccent: string;
  };
  artwork: {
    primaryColor: string;
    secondaryColor: string;
    pattern: "waves" | "grid" | "stripes" | "pixel";
    titleText: string;
    subText?: string;
  };
  hasESRB: boolean;
}

// Predefined cartridge collection
const CARTRIDGES: Cartridge[] = [
  {
    id: "subnautica",
    name: "Subnautica",
    romFile: "subnautica.gbc",
    gameId: "subnautica",
    type: "SCRLBOY",
    colorStyle: {
      bodyGradient: "linear-gradient(145deg, #3EC7E8 0%, #1A7FA5  100%)",
      labelGloss: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 60%)",
      textureOverlay: "repeating-linear-gradient(45deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 6px)",
      borderAccent: "#3d405b",
    },
    artwork: {
      primaryColor: "#0a4c6e",
      secondaryColor: "#1b98b5",
      pattern: "waves",
      titleText: "<font value='days'><color value='#F18600'>SUB</color><color value='#B4DBEE'>NAUTICA</color></font>",
      subText: "Dive Into the Unknown.",
    },
    hasESRB: false,
  }
];

// Helper to generate paper texture (scratches/wear) as dataURI canvas
const generateScratchTexture = () => {
  if (typeof window === "undefined") return "none";
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "none";
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, 200, 200);
  for (let i = 0; i < 180; i++) {
    ctx.beginPath();
    const x = Math.random() * 200;
    const y = Math.random() * 200;
    const len = 2 + Math.random() * 8;
    const angle = Math.random() * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,210,${0.1 + Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 200, Math.random() * 200, 1 + Math.random() * 2, 1);
  }
  return canvas.toDataURL();
};

// Helper for ABS grain noise
const noiseTexture = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.12'/%3E%3C/svg%3E")`;

// Font injection helper
const injectedFonts = new Set<string>();
const injectFont = (fontName: string) => {
  if (injectedFonts.has(fontName) || typeof document === "undefined") return;
  injectedFonts.add(fontName);
  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: '${fontName}';
      src: url('/fonts/${fontName}.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }

    .font-${fontName} {
      font-family: '${fontName}', sans-serif;
    }
  `;
  document.head.appendChild(style);
};

// Cartridge component with realistic rendering
const CartridgeItem = ({
  cartridge,
  isSelected,
  onSelect,
  isLoading,
}: {
  cartridge: Cartridge;
  isSelected: boolean;
  onSelect: () => void;
  isLoading: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [scratchTexture, setScratchTexture] = useState<string>("none");

  useEffect(() => {
    setScratchTexture(generateScratchTexture());
  }, []);

  // Determine tilt angle based on position index for subtle variety
  const tiltRotate = `${(Math.sin(parseInt(cartridge.id.charCodeAt(0).toString()) * 0.3) * 3 + 2).toFixed(1)}deg`;
  const tiltY = `${(Math.cos(parseInt(cartridge.id.slice(-1).charCodeAt(0).toString()) * 0.2) * 4 + 4).toFixed(1)}deg`;

  // Artwork pattern generation
  const getArtworkBg = () => {
    const { primaryColor, secondaryColor, pattern } = cartridge.artwork;
    switch (pattern) {
      case "waves":
        return `repeating-linear-gradient(90deg, ${secondaryColor}20 0px, ${secondaryColor}20 2px, transparent 2px, transparent 12px), radial-gradient(circle at 30% 40%, ${secondaryColor}30 2%, ${primaryColor}80 70%)`;
      case "grid":
        return `repeating-linear-gradient(0deg, ${secondaryColor}30 0px, ${secondaryColor}30 2px, transparent 2px, transparent 16px), repeating-linear-gradient(90deg, ${secondaryColor}30 0px, ${secondaryColor}30 2px, transparent 2px, transparent 16px), radial-gradient(ellipse at 20% 30%, ${primaryColor} 0%, ${primaryColor}cc 100%)`;
      case "stripes":
        return `repeating-linear-gradient(45deg, ${secondaryColor}40 0px, ${secondaryColor}40 4px, transparent 4px, transparent 18px), linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`;
      default:
        return `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
    }
  };

  const renderStyledText = (text: string): React.ReactNode => {
    const tagRegex = /<(color|font)\s+value='([^']+)'>(.*?)<\/\1>/g;
    const matches = [...text.matchAll(tagRegex)];
    if (matches.length === 0) return text;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    for (const match of matches) {
      const [full, tag, value, inner] = match;
      const index = match.index!;
      // Plain text before match
      if (index > lastIndex) {
        parts.push(text.slice(lastIndex, index));
      }
      // Recursively parse inner content (supports nesting)
      const renderedInner = renderStyledText(inner);
      if (tag === "color") {
        parts.push(<span key={index} style={{ color: value }}>{renderedInner}</span>);
      } else if (tag === "font") {
        injectFont(value);
        parts.push(
          <span key={index} style={{ fontFamily: `'${value}', sans-serif` }}>
            {renderedInner}
          </span>
        );
      }
      lastIndex = index + full.length;
    }
    // Trailing plain text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  return (
    <div
      className="relative cursor-pointer transition-all duration-300 ease-out"
      style={{
        transform: isHovered
          ? `translateY(-12px) rotateZ(${tiltRotate}) rotateY(${tiltY})`
          : `translateY(0px) rotateZ(${tiltRotate}) rotateY(${tiltY})`,
        filter: isHovered ? "drop-shadow(0 18px 27px rgba(0,0,0,0.35))" : "drop-shadow(0 9px 15px rgba(0,0,0,0.25))",
        transition: "transform 0.2s cubic-bezier(0.2, 0.9, 0.4, 1.1), filter 0.2s",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => !isLoading && onSelect()}
    >
      {/* Main cartridge body */}
      <div
        className="relative rounded-md"
        style={{
          width: "144px",
          height: "195px",
          background: cartridge.colorStyle.bodyGradient,
          borderRadius: "9px 9px 18px 18px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.15)",
          border: `1px solid ${cartridge.colorStyle.borderAccent}`,
          overflow: "hidden",
        }}
      >
        {/* ABS plastic grain overlay */}
        <div
          className="absolute inset-0 pointer-events-none mix-blend-multiply"
          style={{
            backgroundImage: noiseTexture,
            backgroundRepeat: "repeat",
            opacity: 0.4,
          }}
        />
        {/* Fine grain texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: cartridge.colorStyle.textureOverlay,
            opacity: 0.5,
          }}
        />

        {/* Injection seam (top edge) */}
        <div className="absolute top-[4.5px] left-[12px] right-[12px] h-[1.5px] bg-black/30 rounded-full" />
        <div className="absolute top-[7.5px] left-[12px] right-[12px] h-[0.75px] bg-white/20 rounded-full" />

        {/* Vertical grip ridges (left side) */}
        <div className="absolute left-[3px] top-[30px] bottom-[30px] w-[4.5px] flex flex-col gap-[4.5px]">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-full h-[3px] bg-black/20 rounded-full" />
          ))}
        </div>
        <div className="absolute right-[3px] top-[30px] bottom-[30px] w-[4.5px] flex flex-col gap-[4.5px]">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-full h-[3px] bg-black/20 rounded-full" />
          ))}
        </div>

        {/* Raised "GAME BOY" style top lip */}
        <div
          className="absolute top-[12px] left-[18px] right-[18px] h-[21px] rounded-sm"
          style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(255,255,255,0.1) 100%)",
            borderBottom: "1px solid rgba(0,0,0,0.3)",
          }}
        >
          <div className="text-[9px] font-black text-center leading-[21px] font-bold tracking-[3px] italic text-black/50">
            {cartridge.type === "SCRLBOY" ? renderStyledText("<font value='bildad'>ScrollBoy</font>") : "Unknown Cartridge"}
          </div>
        </div>

        {/* Label Area */}
        <div
          className="absolute left-[12px] right-[12px] top-[42px] h-[102px] rounded-sm overflow-hidden"
          style={{
            background: getArtworkBg(),
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3), 0 1px 1px rgba(255,255,255,0.2)",
          }}
        >
          {/* Micro-scratches overlay */}
          {scratchTexture !== "none" && (
            <div
              className="absolute inset-0 pointer-events-none mix-blend-overlay"
              style={{ backgroundImage: `url(${scratchTexture})`, backgroundSize: "cover", opacity: 0.35 }}
            />
          )}
          {/* Paper sheen reflection */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(125deg, rgba(255,255,245,0.3) 0%, rgba(255,255,245,0) 40%, rgba(0,0,0,0.1) 100%)",
            }}
          />
          {/* Label artwork title */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1">
            <div
              className="font-black text-[15px] tracking-[-0.45px] leading-tight"
              style={{
                color: "#fff",
                textShadow: "0 1px 1px black",
                background: "rgba(0,0,0,0.3)",
                padding: "0 2px",
                borderRadius: "2px",
              }}
            >
              {renderStyledText(cartridge.artwork.titleText)}
            </div>
            {cartridge.artwork.subText && (
              <div className="text-[9px] font-bold mt-[3px] text-white/80">{cartridge.artwork.subText}</div>
            )}
          </div>
          {/* Region / ESRB marking */}
          {cartridge.hasESRB && (
            <div className="absolute bottom-[3px] right-[3px] bg-black/60 rounded-[1px] px-[3px] text-[6px] font-bold text-white">
              E
            </div>
          )}
        </div>

        {/* Bottom edge bevel */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[9px] rounded-b-md"
          style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 100%)" }}
        />

        {/* Molded chamfer shadows */}
        <div className="absolute inset-x-0 bottom-[4px] h-[1px] bg-white/10" />
      </div>

      {/* Soft ambient ground shadow (diffused) */}
      <div
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-[85%] h-[18px] rounded-full transition-all duration-200 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 70%)",
          opacity: isHovered ? 0.7 : 0.5,
          transform: isHovered ? "scale(1.1)" : "scale(1)",
        }}
      />
    </div>
  );
};

export default function GBAEmulator() {
  const screenWrapperRef = useRef<HTMLDivElement>(null);
  const [emulatorRunning, setEmulatorRunning] = useState(false);
  const [nostalgist, setNostalgist] = useState<any>(null);
  const [pressedButtons, setPressedButtons] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Load Cartridge");
  const [selectedCartridge, setSelectedCartridge] = useState<Cartridge>(CARTRIDGES[0]);
  const [isSwitchingGame, setIsSwitchingGame] = useState(false);

  // SRAM management: store last known bytes per gameId
  const lastSramMap = useRef<Map<string, Uint8Array>>(new Map());
  const sramIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nostalgistRef = useRef<any>(null);

  useEffect(() => {
    nostalgistRef.current = nostalgist;
  }, [nostalgist]);

  // Flush SRAM for a given gameId
  const flushSram = useCallback(async (instance: any, gameId: string) => {
    if (!instance || !gameId) return;
    try {
      const blob: Blob = await instance.saveSRAM();
      const buf = await blob.arrayBuffer();
      const next = new Uint8Array(buf);
      if (next.length === 0) return;
      const last = lastSramMap.current.get(gameId);
      if (!last || !uint8ArraysEqual(last, next)) {
        await persistSram(gameId, next);
        lastSramMap.current.set(gameId, next);
      }
    } catch (err) {
      // ignore silently
    }
  }, []);

  const pressButton = useCallback(
    (buttonName: keyof typeof GBA_BUTTONS) => {
      if (!emulatorRunning || !nostalgist) return;
      nostalgist.pressDown(buttonName.toLowerCase());
      setPressedButtons((prev) => new Set(prev).add(buttonName.toLowerCase()));
    },
    [emulatorRunning, nostalgist]
  );

  const releaseButton = useCallback(
    (buttonName: keyof typeof GBA_BUTTONS) => {
      if (!nostalgist) return;
      nostalgist.pressUp(buttonName.toLowerCase());
      setPressedButtons((prev) => {
        const newSet = new Set(prev);
        newSet.delete(buttonName.toLowerCase());
        return newSet;
      });
    },
    [nostalgist]
  );

  // Stop polling
  const stopSramPolling = useCallback(() => {
    if (sramIntervalRef.current) {
      clearInterval(sramIntervalRef.current);
      sramIntervalRef.current = null;
    }
  }, []);

  // Start polling for current instance & current gameId
  const startSramPolling = useCallback(
    (instance: any, gameId: string) => {
      if (sramIntervalRef.current) clearInterval(sramIntervalRef.current);
      sramIntervalRef.current = setInterval(() => {
        flushSram(instance, gameId);
      }, SRAM_POLL_MS);
    },
    [flushSram]
  );

  // Core game loading logic (stops current, loads new cartridge)
  const loadGame = useCallback(
    async (cartridge: Cartridge) => {
      if (isSwitchingGame) return;
      setIsSwitchingGame(true);
      setLoading(true);
      setStatusText(`Loading ${cartridge.name}...`);

      try {
        // 1. Flush existing SRAM if emulator is running
        if (nostalgist && emulatorRunning) {
          const currentGameId = selectedCartridge.gameId;
          await flushSram(nostalgist, currentGameId);
          stopSramPolling();
          await nostalgist.exit();
          setNostalgist(null);
          setEmulatorRunning(false);
        } else if (nostalgist) {
          // just exit cleanly without flush? still exit
          await nostalgist.exit();
          setNostalgist(null);
          setEmulatorRunning(false);
        }

        const wrapper = screenWrapperRef.current;
        if (!wrapper) throw new Error("Screen wrapper missing");

        // Clear old canvas
        const existingCanvases = wrapper.querySelectorAll("canvas");
        existingCanvases.forEach((c) => c.remove());

        const canvas = document.createElement("canvas");
        canvas.id = "emulator-canvas";
        wrapper.appendChild(canvas);

        // Load persisted SRAM for the new game
        const persistedSram = await loadPersistedSram(cartridge.gameId);
        const { Nostalgist } = await import("nostalgist");

        const instance = await Nostalgist.launch({
          element: canvas,
          core: "gambatte",
          rom: [cartridge.romFile],
          bios: ["gbc_bios.bin"],
          ...(persistedSram ? { sram: persistedSram } : {}),
          runEmulatorManually: false,
          size: { width: 160, height: 144 },
          resolveRom: (romPath: string) => `/roms/${romPath}`,
          resolveCoreJs: (coreJS) => `/cores/${coreJS}_libretro.js`,
          resolveCoreWasm: (coreWASM) => `/cores/${coreWASM}_libretro.wasm`,
          resolveBios: (bios: string) => `/bios/${bios}`,
        });

        // Reset last sram pointer for this game
        // (we don't clear the map, just let next flush update)
        setNostalgist(instance);
        setEmulatorRunning(true);
        setSelectedCartridge(cartridge);
        setStatusText("");
        startSramPolling(instance, cartridge.gameId);
      } catch (error) {
        console.error("Failed to load game:", error);
        setStatusText(`Error: ${cartridge.name} failed`);
        setEmulatorRunning(false);
      } finally {
        setLoading(false);
        setIsSwitchingGame(false);
      }
    },
    [nostalgist, emulatorRunning, selectedCartridge, flushSram, stopSramPolling, startSramPolling, isSwitchingGame]
  );

  // Power switch toggle: if off -> load selected game; if on -> shut down
  const handleSwitchToggle = async () => {
    if (!emulatorRunning) {
      if (!loading) await loadGame(selectedCartridge);
    } else {
      // Power off
      stopSramPolling();
      if (nostalgist) {
        await flushSram(nostalgist, selectedCartridge.gameId);
        await nostalgist.exit();
        setNostalgist(null);
      }
      setEmulatorRunning(false);
      setStatusText("");
    }
  };

  // Cartridge click: change selected game and auto-load (power on)
  const handleCartridgeSelect = async (cartridge: Cartridge) => {
    if (cartridge.id === selectedCartridge.id) return; // same cartridge, do nothing

    // Power off if running
    if (emulatorRunning && nostalgist) {
      stopSramPolling();
      await flushSram(nostalgist, selectedCartridge.gameId);
      await nostalgist.exit();
      setNostalgist(null);
      setEmulatorRunning(false);
    }
    setSelectedCartridge(cartridge);
    setStatusText(""); // clear any error/status
  };

  // Style canvas with green filter & size constraints
  useEffect(() => {
    if (!emulatorRunning) return;
    const wrapper = screenWrapperRef.current;
    if (!wrapper) return;
    const styleCanvas = () => {
      const canvas = wrapper.querySelector("canvas");
      if (!canvas) return;
      canvas.style.filter = "grayscale(1)";
      canvas.style.mixBlendMode = "overlay";
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      canvas.style.imageRendering = "pixelated";
    };
    styleCanvas();
    const observer = new MutationObserver(styleCanvas);
    observer.observe(wrapper, { childList: true, subtree: true });
    const ro = new ResizeObserver(styleCanvas);
    ro.observe(wrapper);
    return () => {
      observer.disconnect();
      ro.disconnect();
    };
  }, [emulatorRunning]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const buttonName = KEY_MAPPINGS[e.code];
      if (buttonName && !pressedButtons.has(buttonName.toLowerCase())) {
        e.preventDefault();
        pressButton(buttonName);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const buttonName = KEY_MAPPINGS[e.code];
      if (buttonName) {
        e.preventDefault();
        releaseButton(buttonName);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [pressButton, releaseButton, pressedButtons]);

  // Button handlers for on-screen controls
  const createButtonHandlers = (buttonName: keyof typeof GBA_BUTTONS) => ({
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
      pressButton(buttonName);
    },
    onMouseUp: () => releaseButton(buttonName),
    onMouseLeave: () => {
      if (pressedButtons.has(buttonName.toLowerCase())) releaseButton(buttonName);
    },
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      pressButton(buttonName);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      releaseButton(buttonName);
    },
  });

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center select-none p-4">
      {/* Outer wrapper: emulator body + switch */}
      <div className="relative flex items-start">
        {/* Game Boy Body */}
        <div
          className="relative flex flex-col items-center"
          style={{
            width: "320px",
            height: "520px",
            background: "linear-gradient(180deg, #E60012 0%, #B3000E 15%, #8A000A 100%)",
            borderRadius: "12px 12px 12px 80px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.2)",
          }}
        >
          {/* Top gray decorative section */}
          <div className="absolute top-0 left-0 right-0" style={{ height: "50px", background: "transparent", borderRadius: "12px 12px 0 0" }}>
            <div
              className="absolute top-[10px] left-[20px] right-[20px] h-[4px] rounded-full"
              style={{
                background: "linear-gradient(180deg, #B3000E 0%, #E60012 50%, #B3000E 100%)",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
              }}
            />
            <div
              className="absolute top-[18px] left-[20px] right-[20px] h-[4px] rounded-full"
              style={{
                background: "linear-gradient(180deg, #B3000E 0%, #E60012 50%, #B3000E 100%)",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
              }}
            />
          </div>

          {/* Screen Bezel */}
          <div
            className="relative mt-[60px]"
            style={{
              width: "227px",
              height: "208px",
              background: "linear-gradient(145deg, #505060 0%, #404050 50%, #303040 100%)",
              borderRadius: "10px 10px 35px 10px",
              padding: "15px",
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5)",
            }}
          >
            <div
              ref={screenWrapperRef}
              className="relative w-full h-full overflow-hidden flex items-center justify-center"
              style={{
                background: "#9c9c9c",
                borderRadius: "4px 4px 24px 4px",
                boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)",
              }}
            >
              {!emulatorRunning && (
                <span className="relative z-10 text-[#cccccc] text-[11px] font-bold text-center px-2 pointer-events-none select-none">
                  {loading ? "Loading..." : "Flip the switch to start"}
                </span>
              )}
            </div>
            {/* Power indicator */}
            <div
              className={`absolute top-[20px] right-[-15px] w-[6px] h-[6px] rounded-full transition-all ${
                emulatorRunning ? "bg-[#ff0000] shadow-[0_0_6px_#ff0000]" : "bg-[#4a0000]"
              }`}
            />
          </div>

          <div className="font-bildad mt-2 text-[#6d0009] text-[10px] font-bold tracking-[3px] italic">ScrollBoy</div>

          {/* Controls Section */}
          <div className="relative w-full flex-1 mt-4">
            {/* D-Pad */}
            <div className="absolute left-[35px] top-[20px]">
              <div className="relative w-[90px] h-[90px]">
                <div
                  className="absolute inset-0"
                  style={{
                    filter: "brightness(0.9)",
                    background: "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)",
                    clipPath: "path('M82.059 29.118 60.882 29.118 60.882 7.941C60.882 5.014 58.516 2.647 55.588 2.647L34.412 2.647C31.484 2.647 29.118 5.014 29.118 7.941L29.118 29.118 7.941 29.118C5.014 29.118 2.647 31.484 2.647 34.412L2.647 55.588C2.647 58.516 5.014 60.882 7.941 60.882L29.118 60.882 29.118 82.059C29.118 84.986 31.484 87.353 34.412 87.353L55.588 87.353C58.516 87.353 60.882 84.986 60.882 82.059L60.882 60.882 82.059 60.882C84.986 60.882 87.353 58.516 87.353 55.588L87.353 34.412C87.353 31.484 84.986 29.118 82.059 29.118L82.059 29.118Z')",
                    boxShadow: "2px 2px 4px rgba(0,0,0,0.4)",
                  }}
                />
                {["UP", "DOWN", "LEFT", "RIGHT"].map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    style={{
                      transform:
                        dir === "UP"
                          ? "translateY(2.647px)"
                          : dir === "DOWN"
                          ? "translateY(-2.647px)"
                          : dir === "LEFT"
                          ? "translateX(2.647px)"
                          : "translateX(-2.647px)",
                      top: dir === "UP" ? "0" : dir === "DOWN" ? "auto" : "50%",
                      bottom: dir === "DOWN" ? "0" : "auto",
                      left: dir === "LEFT" ? "0" : dir === "RIGHT" ? "auto" : "50%",
                      right: dir === "RIGHT" ? "0" : "auto",
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-[32px] h-[27.353px] ${
                      dir === "LEFT" || dir === "RIGHT" ? "h-[32px] w-[27.353px]" : ""
                    } border-none cursor-pointer transition-all ${
                      pressedButtons.has(dir.toLowerCase())
                        ? "bg-[#1a1a1a]"
                        : "bg-transparent hover:bg-[#3a3a3a] active:bg-[#1a1a1a]"
                    } ${dir === "UP" ? "rounded-t-[4px]" : dir === "DOWN" ? "rounded-b-[4px]" : ""} ${
                      dir === "LEFT" ? "rounded-l-[4px]" : dir === "RIGHT" ? "rounded-r-[4px]" : ""
                    }`}
                    {...createButtonHandlers(dir as keyof typeof GBA_BUTTONS)}
                  />
                ))}
              </div>
            </div>

            {/* A/B Buttons */}
            <div className="absolute right-[25px] top-[15px]">
              <div className="relative w-[100px] h-[80px]">
                <button
                  type="button"
                  className={`absolute left-0 bottom-0 w-[45px] h-[45px] rounded-full border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                    pressedButtons.has("b") ? "scale-95 brightness-75" : ""
                  }`}
                  style={{
                    color: "rgba(0,0,0,0.35)",
                    fontWeight: "bolder",
                    background: "linear-gradient(145deg, #c71585 0%, #a01060 100%)",
                    boxShadow: pressedButtons.has("b")
                      ? "1px 1px 2px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.3)"
                      : "2px 3px 6px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)",
                  }}
                  {...createButtonHandlers("B")}
                >
                  B
                </button>
                <button
                  type="button"
                  className={`absolute right-0 top-0 w-[45px] h-[45px] rounded-full border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                    pressedButtons.has("a") ? "scale-95 brightness-75" : ""
                  }`}
                  style={{
                    color: "rgba(0,0,0,0.35)",
                    fontWeight: "bolder",
                    background: "linear-gradient(145deg, #c71585 0%, #a01060 100%)",
                    boxShadow: pressedButtons.has("a")
                      ? "1px 1px 2px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.3)"
                      : "2px 3px 6px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)",
                  }}
                  {...createButtonHandlers("A")}
                >
                  A
                </button>
              </div>
            </div>

            {/* Start/Select */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[30px] flex gap-[30px]">
              {["SELECT", "START"].map((btn) => (
                <div key={btn} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    className={`w-[45px] h-[12px] rounded-[6px] border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                      pressedButtons.has(btn.toLowerCase()) ? "scale-95 brightness-75" : ""
                    }`}
                    style={{
                      background: "linear-gradient(180deg, #707070 0%, #505050 100%)",
                      boxShadow: "1px 2px 3px rgba(0,0,0,0.4)",
                    }}
                    {...createButtonHandlers(btn as keyof typeof GBA_BUTTONS)}
                  />
                  <span className="text-[8px] font-bold text-[#440006] tracking-wider">{btn}</span>
                </div>
              ))}
            </div>

            {/* Speaker Grille */}
            <div className="absolute right-[30px] bottom-[30px] flex flex-col gap-[4px]" style={{ transform: "rotate(-25deg)" }}>
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="w-[35px] h-[4px] rounded-full"
                  style={{
                    background: "linear-gradient(180deg, #6d0009ff 0%, #8f000c 50%, #B3000E 100%)",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Power rocker switch */}
        <div
          style={{
            alignSelf: "flex-start",
            marginTop: "96px",
            overflow: "hidden",
            width: "10px",
            height: "45px",
            position: "relative",
          }}
        >
          <div
            onClick={handleSwitchToggle}
            role="button"
            tabIndex={0}
            style={{
              position: "absolute",
              left: "-4px",
              top: emulatorRunning ? "0px" : "21px",
              transition: "top 0.14s cubic-bezier(0.4, 0, 0.2, 1)",
              width: "14px",
              height: "24px",
              cursor: "pointer",
              outline: "none",
              borderLeft: "5px solid #505050",
              background: "linear-gradient(90deg, #b0b0b0 0%, #909090 40%, #707070 100%)",
              borderRadius: "6px",
              boxShadow: [
                "2px 0 0 #505050",
                "2px 1px 3px rgba(0,0,0,0.5)",
                "inset 0 1px 0 rgba(255,255,255,0.4)",
                "inset 0 -1px 0 rgba(0,0,0,0.2)",
              ].join(", "),
            }}
          >
            {[6, 12].map((top) => (
              <div key={top}>
                <div
                  style={{
                    position: "absolute",
                    left: "2px",
                    right: "3px",
                    height: "1px",
                    top: `${top}px`,
                    background: "rgba(0,0,0,0.25)",
                    borderRadius: "1px",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "2px",
                    right: "3px",
                    height: "1px",
                    top: `${top + 1}px`,
                    background: "rgba(255,255,255,0.18)",
                    borderRadius: "1px",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CARTRIDGE SHELF */}
      <div className="mt-12 w-full max-w-4xl px-4">
        <div className="flex flex-wrap justify-center gap-8 items-end">
          {CARTRIDGES.map((cart) => (
            <CartridgeItem
              key={cart.id}
              cartridge={cart}
              isSelected={selectedCartridge.id === cart.id}
              onSelect={() => handleCartridgeSelect(cart)}
              isLoading={loading || isSwitchingGame}
            />
          ))}
        </div>
        <div className="text-center text-[#555] text-[10px] mt-6">click any cartridge to insert & play</div>
      </div>

      {/* Keyboard hints */}
      <div className="fixed bottom-[10px] left-1/2 -translate-x-1/2 text-[#444] text-[10px] text-center">
        Arrow Keys = D-Pad | Z = A | X = B | Enter = Start | Shift = Select
      </div>
    </div>
  );
}