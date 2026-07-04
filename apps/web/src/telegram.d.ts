interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name: string; username?: string };
  };
  HapticFeedback: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
  };
}

interface Window {
  Telegram: { WebApp: TelegramWebApp };
}