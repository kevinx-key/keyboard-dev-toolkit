import "./globals.css";
import { I18nProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";
import { APP_VERSION } from "../lib/platform-bridge";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <title>{`Keyboard Dev Toolkit v${APP_VERSION}`}</title>
        <meta name="description" content="Keyboard Dev Toolkit — 在线键盘配列设计与 PCB/定位板生成工具" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.png" type="image/png" />
        {/* 内联脚本在 React 水合前同步读取 localStorage 并设置主题 class，防止 FOUC */}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){
            try {
              var t=localStorage.getItem("kle-theme");
              if(t&&["classic","dark","material","future","business"].includes(t)) document.documentElement.classList.add("theme-"+t);
              else document.documentElement.classList.add("theme-classic");
            }catch(e){document.documentElement.classList.add("theme-classic");}
          })();`,
        }} />
      </head>
      {/* h-full + overflow-hidden：外壳视口定高，滚动交给内部 flex:1 容器，
          保证 kle-canvas-area 链路高度确定，画布百分比高度可解析 */}
      <body className="h-full flex flex-col overflow-hidden">
        <ThemeProvider><I18nProvider>{children}</I18nProvider></ThemeProvider>
      </body>
    </html>
  );
}
