// /app/types/global.d.ts
export {};

declare global {
  interface HirexaDesktopBridge {
    getShareSafeContentProtectionState?: () => Promise<boolean> | boolean;
    minimizeWindow?: () => Promise<void> | void;
    setShareSafeContentProtection?: (
      enabled: boolean
    ) => Promise<boolean | void> | boolean | void;
  }

  interface Window {
    Dropbox?: {
      choose: (options: {
        success: (
          files: Array<{
            link: string;
            name: string;
          }>
        ) => void;
        cancel?: () => void;
        linkType?: "direct" | "preview";
        multiselect?: boolean;
        extensions?: string[];
      }) => void;
    };
    electronAPI?: HirexaDesktopBridge;
    hirexaDesktop?: HirexaDesktopBridge;
  }
}
