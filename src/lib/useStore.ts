import { useEffect, useReducer } from "react";
import { store } from "./store";

export function useStore() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsub = store.subscribe(bump);
    return () => {
      unsub();
    };
  }, []);
  return store;
}
