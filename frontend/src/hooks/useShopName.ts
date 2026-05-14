import { useEffect, useState } from "react";
import { SETTINGS_UPDATED_EVENT, settingsStore, type AppSettings } from "@/lib/fileStore";

const DEFAULT_SHOP_NAME = "ShopFlow";

function normalizeShopName(value: string | null | undefined) {
  return value?.trim() || DEFAULT_SHOP_NAME;
}

export function useShopName() {
  const [shopName, setShopName] = useState(DEFAULT_SHOP_NAME);

  useEffect(() => {
    let mounted = true;

    settingsStore.get().then((settings) => {
      if (mounted) setShopName(normalizeShopName(settings.shop_name));
    });

    const handleSettingsUpdated = (event: Event) => {
      const settings = (event as CustomEvent<AppSettings>).detail;
      setShopName(normalizeShopName(settings?.shop_name));
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      mounted = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, []);

  return shopName;
}
