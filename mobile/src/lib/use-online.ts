import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/** False while the device reports no internet connection. Unknown counts as online. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
  }, []);
  return online;
}
