// /app/types/global.d.ts
export {};

declare global {
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
  }
}
