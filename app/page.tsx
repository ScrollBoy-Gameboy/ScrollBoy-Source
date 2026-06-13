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
  gameId: string;
  type: "SCRLBOY";
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
      labelGloss:
        "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 60%)",
      textureOverlay:
        "repeating-linear-gradient(45deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 6px)",
      borderAccent: "#3d405b",
    },
    artwork: {
      primaryColor: "#0a4c6e",
      secondaryColor: "#1b98b5",
      pattern: "waves",
      titleText:
        "<font value='days'><color value='#F18600'>SUB</color><color value='#B4DBEE'>NAUTICA</color></font>",
      subText: "Dive Into the Unknown.",
    },
    hasESRB: false,
  },
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
    ctx.fillRect(
      Math.random() * 200,
      Math.random() * 200,
      1 + Math.random() * 2,
      1
    );
  }
  return canvas.toDataURL();
};

// Advanced ABS grain noise (higher quality)
const noiseTexture = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.18'/%3E%3C/svg%3E")`;

// Fine micro-texture for ABS
const microTexture = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise2)' opacity='0.1'/%3E%3C/svg%3E")`;

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

// Cartridge component with ultra-realistic rendering
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

  const tiltRotate = `${(
    Math.sin(parseInt(cartridge.id.charCodeAt(0).toString()) * 0.3) * 3 +
    2
  ).toFixed(1)}deg`;
  const tiltY = `${(
    Math.cos(parseInt(cartridge.id.slice(-1).charCodeAt(0).toString()) * 0.2) *
      4 +
    4
  ).toFixed(1)}deg`;

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
      if (index > lastIndex) {
        parts.push(text.slice(lastIndex, index));
      }
      const renderedInner = renderStyledText(inner);
      if (tag === "color") {
        parts.push(
          <span key={index} style={{ color: value }}>
            {renderedInner}
          </span>
        );
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
        filter: isHovered
          ? "drop-shadow(0 18px 27px rgba(0,0,0,0.45))"
          : "drop-shadow(0 9px 15px rgba(0,0,0,0.35))",
        transition:
          "transform 0.2s cubic-bezier(0.2, 0.9, 0.4, 1.1), filter 0.2s",
        zIndex: isHovered ? 20 : 10,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => !isLoading && onSelect()}
    >
      <div
        className="relative rounded-md"
        style={{
          width: "144px",
          height: "195px",
          background: cartridge.colorStyle.bodyGradient,
          borderRadius: "9px 9px 18px 18px",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.15)",
          border: `1px solid ${cartridge.colorStyle.borderAccent}`,
          overflow: "hidden",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none mix-blend-multiply"
          style={{
            backgroundImage: noiseTexture,
            backgroundRepeat: "repeat",
            opacity: 0.4,
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: cartridge.colorStyle.textureOverlay,
            opacity: 0.5,
          }}
        />

        <div className="absolute top-[4.5px] left-[12px] right-[12px] h-[1.5px] bg-black/30 rounded-full" />
        <div className="absolute top-[7.5px] left-[12px] right-[12px] h-[0.75px] bg-white/20 rounded-full" />

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

        <div
          className="absolute top-[12px] left-[18px] right-[18px] h-[21px] rounded-sm"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(255,255,255,0.1) 100%)",
            borderBottom: "1px solid rgba(0,0,0,0.3)",
          }}
        >
          <div className="text-[9px] font-black text-center leading-[21px] font-bold tracking-[3px] italic text-black/50">
            {cartridge.type === "SCRLBOY"
              ? renderStyledText("<font value='bildad'>ScrollBoy</font>")
              : "Unknown Cartridge"}
          </div>
        </div>

        <div
          className="absolute left-[12px] right-[12px] top-[42px] h-[102px] rounded-sm overflow-hidden"
          style={{
            background: getArtworkBg(),
            boxShadow:
              "inset 0 1px 3px rgba(0,0,0,0.3), 0 1px 1px rgba(255,255,255,0.2)",
          }}
        >
          {scratchTexture !== "none" && (
            <div
              className="absolute inset-0 pointer-events-none mix-blend-overlay"
              style={{
                backgroundImage: `url(${scratchTexture})`,
                backgroundSize: "cover",
                opacity: 0.35,
              }}
            />
          )}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(125deg, rgba(255,255,245,0.3) 0%, rgba(255,255,245,0) 40%, rgba(0,0,0,0.1) 100%)",
            }}
          />
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
              <div className="text-[9px] font-bold mt-[3px] text-white/80">
                {cartridge.artwork.subText}
              </div>
            )}
          </div>
          {cartridge.hasESRB && (
            <div className="absolute bottom-[3px] right-[3px] bg-black/60 rounded-[1px] px-[3px] text-[6px] font-bold text-white">
              E
            </div>
          )}
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-[9px] rounded-b-md"
          style={{
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 100%)",
          }}
        />

        <div className="absolute inset-x-0 bottom-[4px] h-[1px] bg-white/10" />
      </div>

      <div
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-[85%] h-[18px] rounded-full transition-all duration-200 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 70%)",
          opacity: isHovered ? 0.8 : 0.6,
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
  const [selectedCartridge, setSelectedCartridge] = useState<Cartridge>(
    CARTRIDGES[0]
  );
  const [isSwitchingGame, setIsSwitchingGame] = useState(false);

  const lastSramMap = useRef<Map<string, Uint8Array>>(new Map());
  const sramIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nostalgistRef = useRef<any>(null);

  useEffect(() => {
    nostalgistRef.current = nostalgist;
  }, [nostalgist]);

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

  const stopSramPolling = useCallback(() => {
    if (sramIntervalRef.current) {
      clearInterval(sramIntervalRef.current);
      sramIntervalRef.current = null;
    }
  }, []);

  const startSramPolling = useCallback(
    (instance: any, gameId: string) => {
      if (sramIntervalRef.current) clearInterval(sramIntervalRef.current);
      sramIntervalRef.current = setInterval(() => {
        flushSram(instance, gameId);
      }, SRAM_POLL_MS);
    },
    [flushSram]
  );

  const loadGame = useCallback(
    async (cartridge: Cartridge) => {
      if (isSwitchingGame) return;
      setIsSwitchingGame(true);
      setLoading(true);
      setStatusText(`Loading ${cartridge.name}...`);

      try {
        if (nostalgist && emulatorRunning) {
          const currentGameId = selectedCartridge.gameId;
          await flushSram(nostalgist, currentGameId);
          stopSramPolling();
          await nostalgist.exit();
          setNostalgist(null);
          setEmulatorRunning(false);
        } else if (nostalgist) {
          await nostalgist.exit();
          setNostalgist(null);
          setEmulatorRunning(false);
        }

        const wrapper = screenWrapperRef.current;
        if (!wrapper) throw new Error("Screen wrapper missing");

        const existingCanvases = wrapper.querySelectorAll("canvas");
        existingCanvases.forEach((c) => c.remove());

        const canvas = document.createElement("canvas");
        canvas.id = "emulator-canvas";
        wrapper.appendChild(canvas);

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
    [
      nostalgist,
      emulatorRunning,
      selectedCartridge,
      flushSram,
      stopSramPolling,
      startSramPolling,
      isSwitchingGame,
    ]
  );

  const handleSwitchToggle = async () => {
    if (!emulatorRunning) {
      if (!loading) await loadGame(selectedCartridge);
    } else {
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

  const handleCartridgeSelect = async (cartridge: Cartridge) => {
    if (cartridge.id === selectedCartridge.id) return;

    if (emulatorRunning && nostalgist) {
      stopSramPolling();
      await flushSram(nostalgist, selectedCartridge.gameId);
      await nostalgist.exit();
      setNostalgist(null);
      setEmulatorRunning(false);
    }
    setSelectedCartridge(cartridge);
    setStatusText("");
  };

  useEffect(() => {
    if (!emulatorRunning) return;
    const wrapper = screenWrapperRef.current;
    if (!wrapper) return;
    const styleCanvas = () => {
      const canvas = wrapper.querySelector("canvas");
      if (!canvas) return;
      canvas.style.filter = "grayscale(1)";
      canvas.style.mixBlendMode = "screen";
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

  const createButtonHandlers = (buttonName: keyof typeof GBA_BUTTONS) => ({
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
      pressButton(buttonName);
    },
    onMouseUp: () => releaseButton(buttonName),
    onMouseLeave: () => {
      if (pressedButtons.has(buttonName.toLowerCase()))
        releaseButton(buttonName);
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
        {/* Ultra-realistic ScrollBoy Body */}
        <div
          className="relative flex flex-col items-center"
          style={{
            width: "340px",
            height: "560px",
            background:
              "radial-gradient(circle at 30% 20%, #e6192b, #b0101a, #7a0a10)",
            borderRadius: "18px 18px 18px 100px",
            boxShadow: `
              0 25px 45px -12px rgba(0,0,0,0.8),
              inset 0 1px 0 rgba(255,255,255,0.25),
              inset 0 -1px 0 rgba(0,0,0,0.2),
              0 0 0 1px rgba(0,0,0,0.3)
            `,
            overflow: "hidden",
          }}
        >
          {/* Injection mold seam - top */}
          <div className="absolute top-[12px] left-[20px] right-[20px] h-[1px] bg-black/20 rounded-full" />
          <div className="absolute top-[14px] left-[20px] right-[20px] h-[0.5px] bg-white/15 rounded-full" />

          {/* Edge wear simulation - subtle highlights on corners */}
          <div className="absolute top-0 left-0 w-[20px] h-[20px] rounded-tl-[18px] bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
          <div className="absolute top-0 right-0 w-[20px] h-[20px] rounded-tr-[18px] bg-gradient-to-bl from-white/5 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[30px] h-[40px] rounded-bl-[100px] bg-gradient-to-tr from-black/15 to-transparent pointer-events-none" />

          {/* ABS micro-texture overlay */}
          <div
            className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-60"
            style={{
              backgroundImage: noiseTexture,
              backgroundRepeat: "repeat",
              backgroundSize: "200px 200px",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-20"
            style={{
              backgroundImage: microTexture,
              backgroundRepeat: "repeat",
              backgroundSize: "80px 80px",
            }}
          />

          {/* Hand oil smudge simulation - faint yellowish tint on edges */}
          <div
            className="absolute left-[12px] bottom-[80px] w-[40px] h-[60px] rounded-full blur-xl bg-amber-900/5 pointer-events-none"
            style={{ filter: "blur(8px)" }}
          />

          {/* Top decorative band - NOW RED to match console */}
          <div>
            {/* Fine horizontal streaks (mold lines) */}
            <div className="absolute top-[12px] left-[20px] right-[20px] h-[1px] bg-black/30 rounded-full" />
            <div className="absolute top-[24px] left-[20px] right-[20px] h-[1px] bg-black/20 rounded-full" />
            <div className="absolute top-[38px] left-[20px] right-[20px] h-[1px] bg-white/10 rounded-full" />
          </div>

          {/* Screen Bezel - deepened for realism */}
          <div
            className="relative mt-[68px]"
            style={{
              width: "240px",
              height: "222px",
              background:
                "linear-gradient(145deg, #3a3a45 0%, #2a2a35 40%, #1a1a25 100%)",
              borderRadius: "12px 12px 42px 12px",
              padding: "16px",
              boxShadow: `
                inset 0 3px 8px rgba(0,0,0,0.6),
                0 2px 4px rgba(255,255,255,0.1)
              `,
            }}
          >
            {/* Inner shadow for depth */}
            <div className="absolute inset-[2px] rounded-[10px] pointer-events-none shadow-inner" />

            {/* LCD Cutout with recessed effect */}
            <div
              ref={screenWrapperRef}
              className="relative w-full h-full overflow-hidden flex items-center justify-center"
              style={{
                background: "#0f0f12",
                borderRadius: "4px 4px 28px 4px",
                boxShadow: `
                  inset 0 0 0 2px rgba(0,0,0,0.5),
                  inset 0 0 0 4px rgba(0,0,0,0.2),
                  0 0 0 1px rgba(255,255,255,0.1)
                `,
              }}
            >
              {/* Subtle screen reflection overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.15) 100%)",
                }}
              />
              {/* Micro dust particles on screen surface */}
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.05) 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.08) 1px, transparent 1px)`,
                  backgroundSize: "40px 40px, 60px 60px",
                }}
              />
              {/* Backlight glow when running */}
              {emulatorRunning && (
                <div
                  className="absolute inset-0 pointer-events-none z-5"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, rgba(100,180,100,0.12) 0%, rgba(0,0,0,0) 70%)",
                    mixBlendMode: "screen",
                  }}
                />
              )}
              {!emulatorRunning && (
                <span className="relative z-10 text-[#888] text-[11px] font-bold text-center px-2 pointer-events-none select-none">
                  {loading ? "Loading..." : "Flip the switch to start"}
                </span>
              )}
            </div>

            {/* Power LED - realistic glow & lens */}
            <div
              className="absolute top-[24px] right-[-14px] w-[8px] h-[8px] rounded-full transition-all duration-200"
              style={{
                background: emulatorRunning
                  ? "radial-gradient(circle, #ff3333, #aa0000)"
                  : "radial-gradient(circle, #440000, #220000)",
                boxShadow: emulatorRunning
                  ? "0 0 8px 2px rgba(255,0,0,0.6)"
                  : "none",
                border: "1px solid rgba(0,0,0,0.5)",
              }}
            />
            {/* LED window plastic diffuser */}
            <div className="absolute top-[23px] right-[-16px] w-[12px] h-[10px] rounded-full bg-white/5 backdrop-blur-[1px] pointer-events-none" />
          </div>

          {/* ScrollBoy logo with embossed effect */}
          <div className="font-bildad mt-3 text-[#5a0006] text-[11px] font-black tracking-[4px] italic relative">
            <span className="relative z-10 drop-shadow-[0_1px_0_rgba(255,255,255,0.2)]">
              SCROLLBOY
            </span>
            <div className="absolute inset-0 text-[#ff6666]/10 blur-[1px] -translate-y-[1px]">
              SCROLLBOY
            </div>
          </div>

          {/* Controls Section with improved gaps and materials */}
          <div className="relative w-full flex-1 mt-5">
            {/* D-Pad - Enhanced 3D with depth and shading */}
            <div className="absolute left-[42px] top-[15px]">
              <div className="relative w-[100px] h-[100px]">
                {/* Base shadow under D-pad */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    filter: "blur(6px)",
                    transform: "translateY(4px)",
                  }}
                />
                {/* Main D-pad body with 3D bevel */}
                <div
                  className="absolute inset-0"
                  style={{
                    filter: "brightness(0.95)",
                    background:
                      "linear-gradient(145deg, #3a3a3a 0%, #1e1e1e 50%, #121212 100%)",
                    clipPath:
                      "path('M91.176 32.353 67.647 32.353 67.647 8.824C67.647 5.897 65.28 3.529 62.353 3.529L37.647 3.529C34.72 3.529 32.353 5.897 32.353 8.824L32.353 32.353 8.824 32.353C5.897 32.353 3.529 34.72 3.529 37.647L3.529 62.353C3.529 65.28 5.897 67.647 8.824 67.647L32.353 67.647 32.353 91.176C32.353 94.103 34.72 96.471 37.647 96.471L62.353 96.471C65.28 96.471 67.647 94.103 67.647 91.176L67.647 67.647 91.176 67.647C94.103 67.647 96.471 65.28 96.471 62.353L96.471 37.647C96.471 34.72 94.103 32.353 91.176 32.353Z')",
                    boxShadow: `
                      inset 0 2px 3px rgba(255,255,255,0.15),
                      inset 0 -3px 5px rgba(0,0,0,0.4),
                      0 5px 8px rgba(0,0,0,0.5)
                    `,
                  }}
                />
                {/* Top highlight for 3D effect */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    clipPath:
                      "path('M91.176 32.353 67.647 32.353 67.647 8.824C67.647 5.897 65.28 3.529 62.353 3.529L37.647 3.529C34.72 3.529 32.353 5.897 32.353 8.824L32.353 32.353 8.824 32.353C5.897 32.353 3.529 34.72 3.529 37.647L3.529 62.353C3.529 65.28 5.897 67.647 8.824 67.647L32.353 67.647 32.353 91.176C32.353 94.103 34.72 96.471 37.647 96.471L62.353 96.471C65.28 96.471 67.647 94.103 67.647 91.176L67.647 67.647 91.176 67.647C94.103 67.647 96.471 65.28 96.471 62.353L96.471 37.647C96.471 34.72 94.103 32.353 91.176 32.353Z')",
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%)",
                  }}
                />
                {/* Center depression / pivot point */}
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[20px] h-[20px] rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, #111 0%, #2a2a2a 100%)",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
                  }}
                />
                {["UP", "DOWN", "LEFT", "RIGHT"].map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    style={{
                      // UP, DOWN, LEFT, RIGHT specific positioning
                      ...(dir === "UP" && {
                        top: "3px",
                        left: "32.5px",
                        right: "32.5px",
                        height: "30px",
                        transform: "none",
                        boxShadow: pressedButtons.has("up")
                          ? "inset 0 1px 2px rgba(0,0,0,0.6)"
                          : "inset 0 1px 0 rgba(255,255,255,0.1)",
                      }),
                      ...(dir === "DOWN" && {
                        bottom: "3px",
                        left: "32.5px",
                        right: "32.5px",
                        height: "30px",
                        transform: "none",
                        boxShadow: pressedButtons.has("down")
                          ? "inset 0 -1px 2px rgba(0,0,0,0.6)"
                          : "0 2px 4px rgba(0,0,0,0.3)",
                      }),
                      ...(dir === "LEFT" && {
                        left: "3px",
                        top: "32.5px",
                        bottom: "32.5px",
                        width: "30px",
                        transform: "none",
                        boxShadow: pressedButtons.has("left")
                          ? "inset -1px 0 2px rgba(0,0,0,0.6)"
                          : "inset 1px 0 0 rgba(255,255,255,0.1)",
                      }),
                      ...(dir === "RIGHT" && {
                        right: "3px",
                        top: "32.5px",
                        bottom: "32.5px",
                        width: "30px",
                        transform: "none",
                        boxShadow: pressedButtons.has("right")
                          ? "inset 1px 0 2px rgba(0,0,0,0.6)"
                          : "inset -1px 0 0 rgba(255,255,255,0.1)",
                      }),
                    }}
                    className={`absolute ${
                      dir === "UP"
                        ? "rounded-t-[6px]"
                        : dir === "DOWN"
                        ? "rounded-b-[6px]"
                        : dir === "LEFT"
                        ? "rounded-l-[6px]"
                        : "rounded-r-[6px]"
                    } border-none cursor-pointer transition-all ${
                      pressedButtons.has(dir.toLowerCase())
                        ? "bg-[#0a0a0a] brightness-75"
                        : "bg-transparent hover:brightness-110 active:brightness-75"
                    } w-[35px] h-[30px] ${dir === "LEFT" || dir === "RIGHT" ? "h-[35px] w-[30px]" : ""}`}
                    {...createButtonHandlers(dir as keyof typeof GBA_BUTTONS)}
                  />
                ))}
                {/* Subtle edge shadow for gap precision */}
                <div className="absolute inset-[2px] rounded-full pointer-events-none border border-black/20" />
              </div>
            </div>

            {/* A/B Buttons - high gloss, fingerprints, smudges */}
            <div className="absolute right-[30px] top-[10px]">
              <div className="relative w-[110px] h-[90px]">
                <button
                  type="button"
                  className={`absolute left-0 bottom-0 w-[50px] h-[50px] rounded-full border-none cursor-pointer transition-all ${
                    pressedButtons.has("b")
                      ? "scale-95 brightness-90"
                      : "hover:brightness-105 active:brightness-90"
                  }`}
                  style={{
                    color: "rgba(0,0,0,0.4)",
                    fontWeight: "bolder",
                    fontSize: "20px",
                    background:
                      "radial-gradient(circle at 35% 35%, #e02a8a, #a01060)",
                    boxShadow: pressedButtons.has("b")
                      ? "inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 2px rgba(255,255,255,0.3)"
                      : "0 6px 12px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                  {...createButtonHandlers("B")}
                >
                  B
                </button>
                <button
                  type="button"
                  className={`absolute right-0 top-0 w-[50px] h-[50px] rounded-full border-none cursor-pointer transition-all ${
                    pressedButtons.has("a")
                      ? "scale-95 brightness-90"
                      : "hover:brightness-105 active:brightness-90"
                  }`}
                  style={{
                    color: "rgba(0,0,0,0.4)",
                    fontWeight: "bolder",
                    fontSize: "20px",
                    background:
                      "radial-gradient(circle at 35% 35%, #e02a8a, #a01060)",
                    boxShadow: pressedButtons.has("a")
                      ? "inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 2px rgba(255,255,255,0.3)"
                      : "0 6px 12px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                  {...createButtonHandlers("A")}
                >
                  A
                </button>
                {/* Smudge trail simulation */}
                <div className="absolute -top-1 right-2 w-[30px] h-[12px] rounded-full bg-white/10 blur-sm rotate-12 pointer-events-none" />
                <div className="absolute bottom-1 left-3 w-[25px] h-[8px] rounded-full bg-black/10 blur-sm -rotate-12 pointer-events-none" />
              </div>
            </div>

            {/* Start/Select - tactile precision */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[40px] flex gap-[40px]">
              {["SELECT", "START"].map((btn) => (
                <div key={btn} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    className={`w-[50px] h-[14px] rounded-full border-none cursor-pointer transition-all ${
                      pressedButtons.has(btn.toLowerCase())
                        ? "scale-95 brightness-75"
                        : "hover:brightness-110 active:brightness-75"
                    }`}
                    style={{
                      background:
                        "linear-gradient(180deg, #5a5a5a 0%, #3a3a3a 100%)",
                      boxShadow:
                        "inset 0 1px 1px rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.4)",
                      borderBottom: "1px solid rgba(0,0,0,0.3)",
                    }}
                    {...createButtonHandlers(btn as keyof typeof GBA_BUTTONS)}
                  />
                  <span className="text-[8px] font-bold text-[#3a0004] tracking-[2px]">
                    {btn}
                  </span>
                </div>
              ))}
            </div>

            {/* Speaker grille - much subtler, almost blended */}
            <div
              className="absolute right-[35px] bottom-[30px] flex flex-col gap-[4px]"
              style={{ transform: "rotate(-28deg)" }}
            >
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="w-[38px] h-[3px] rounded-full"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(80,0,8,0.4) 0%, rgba(120,0,12,0.6) 100%)",
                    boxShadow: "inset 0 1px 1px rgba(0,0,0,0.3)",
                  }}
                />
              ))}
              {/* Soft blur overlay to reduce visibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent pointer-events-none rounded-md" />
            </div>

            {/* Extra wear: corner scuff marks */}
            <div className="absolute bottom-0 right-0 w-[30px] h-[30px] rounded-bl-full bg-black/10 pointer-events-none" />
          </div>

          {/* Bottom edge bevel & injection seam */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[14px] rounded-b-[100px]"
            style={{
              background:
                "linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)",
            }}
          />
          <div className="absolute bottom-[6px] left-[20px] right-[20px] h-[1px] bg-white/10 rounded-full" />
        </div>

        {/* Power rocker switch - realistic texture */}
        <div
          style={{
            alignSelf: "flex-start",
            marginTop: "106px",
            overflow: "hidden",
            width: "12px",
            height: "52px",
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
              top: emulatorRunning ? "0px" : "26px",
              transition: "top 0.14s cubic-bezier(0.4, 0, 0.2, 1)",
              width: "16px",
              height: "26px",
              cursor: "pointer",
              outline: "none",
              borderLeft: "6px solid #404040",
              background:
                "linear-gradient(90deg, #c0c0c0 0%, #a0a0a0 40%, #808080 100%)",
              borderRadius: "8px",
              boxShadow: [
                "2px 0 0 #505050",
                "2px 2px 4px rgba(0,0,0,0.6)",
                "inset 0 1px 0 rgba(255,255,255,0.5)",
                "inset 0 -1px 0 rgba(0,0,0,0.2)",
              ].join(", "),
            }}
          >
            {[8, 16].map((top) => (
              <div key={top}>
                <div
                  style={{
                    position: "absolute",
                    left: "2px",
                    right: "3px",
                    height: "1px",
                    top: `${top}px`,
                    background: "rgba(0,0,0,0.3)",
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
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: "1px",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* REALISTIC PHYSICAL SHELF - unchanged from existing high quality */}
      <div className="mt-12 w-full max-w-5xl px-6 relative">
        <div className="relative">
          <div className="absolute -bottom-6 left-2 right-2 h-8 rounded-full bg-black/50 blur-xl -z-10" />

          <div className="relative bg-[#2a1f18] rounded-md overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-b from-white/20 to-transparent z-10 pointer-events-none" />

            <div
              className="relative p-5"
              style={{
                background: `
                  repeating-linear-gradient(45deg, rgba(80,50,35,0.2) 0px, rgba(80,50,35,0.2) 2px, transparent 2px, transparent 8px),
                  repeating-linear-gradient(0deg, rgba(60,40,25,0.15) 0px, rgba(60,40,25,0.15) 1px, transparent 1px, transparent 12px),
                  linear-gradient(145deg, #5a3a28 0%, #3d2619 100%)
                `,
                boxShadow:
                  "inset 0 1px 4px rgba(255,255,255,0.1), inset 0 -2px 8px rgba(0,0,0,0.3)",
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none opacity-20 mix-blend-multiply"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='wood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.2' numOctaves='4' seed='5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23wood)' opacity='0.6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "repeat",
                  backgroundSize: "180px 180px",
                }}
              />

              <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/5 via-transparent to-black/20" />

              <div className="relative space-y-6">
                <div className="relative">
                  <div
                    className="absolute inset-x-0 top-0 bottom-0 -z-5 rounded-sm"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 10%, rgba(0,0,0,0) 90%, rgba(0,0,0,0.3) 100%)",
                    }}
                  />

                  <div className="flex flex-wrap justify-center items-end gap-8 relative">
                    {CARTRIDGES.map((cart) => (
                      <div key={cart.id} className="relative group/compartment">
                        <div className="relative">
                          <div
                            className="absolute inset-0 -z-10 rounded-md"
                            style={{
                              background: "linear-gradient(145deg, #2a1a10, #1f120a)",
                              transform: "translateZ(-4px)",
                              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
                            }}
                          />

                          <div
                            className="absolute left-0 right-0 bottom-0 h-4 -z-5"
                            style={{
                              background: "linear-gradient(0deg, #2a1a10, #3d2619)",
                              transform: "translateY(4px)",
                              borderBottomLeftRadius: "2px",
                              borderBottomRightRadius: "2px",
                            }}
                          />

                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 -z-5"
                            style={{
                              background: "linear-gradient(90deg, #2a1a10, #3d2619)",
                              transform: "translateX(-4px)",
                              borderTopLeftRadius: "2px",
                              borderBottomLeftRadius: "2px",
                            }}
                          />

                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 -z-5"
                            style={{
                              background: "linear-gradient(90deg, #3d2619, #2a1a10)",
                              transform: "translateX(4px)",
                              borderTopRightRadius: "2px",
                              borderBottomRightRadius: "2px",
                            }}
                          />

                          <div
                            className="absolute bottom-0 left-2 right-2 h-8 rounded-t-xl pointer-events-none"
                            style={{
                              background:
                                "radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 80%)",
                              transform: "translateY(6px)",
                            }}
                          />

                          <div className="relative">
                            <CartridgeItem
                              cartridge={cart}
                              isSelected={selectedCartridge.id === cart.id}
                              onSelect={() => handleCartridgeSelect(cart)}
                              isLoading={loading || isSwitchingGame}
                            />
                          </div>

                          <div
                            className="absolute top-0 left-0 right-0 h-3 pointer-events-none rounded-t-md"
                            style={{
                              background:
                                "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 100%)",
                            }}
                          />
                        </div>

                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-black/40 rounded-full blur-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="absolute -bottom-3 left-0 right-0 h-5 rounded-b-md"
                style={{
                  background: "linear-gradient(0deg, #1f120a 0%, #3d2619 100%)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.3)",
                }}
              />
              <div className="absolute -bottom-3 left-0 right-0 h-[2px] bg-black/40 rounded-full -z-5" />
            </div>

            <div className="absolute -bottom-2 left-0 right-0 h-2 rounded-b-md bg-black/30 blur-sm pointer-events-none" />
          </div>

          <div className="absolute -top-4 left-8 right-8 h-px bg-white/20 rounded-full blur-sm pointer-events-none" />
        </div>

        <div className="text-center text-[#777] text-[10px] mt-6 tracking-wide">
          click any cartridge to insert & play
        </div>
      </div>

      <div className="fixed bottom-[10px] left-1/2 -translate-x-1/2 text-[#555] text-[10px] text-center backdrop-blur-sm bg-black/30 px-3 py-1 rounded-full">
        Arrow Keys = D-Pad | Z = A | X = B | Enter = Start | Shift = Select
      </div>
    </div>
  );
}