import { createContext, useContext } from "react";
import { DEFAULT_DISPLAY_NAMES } from "@/domain/worldbook/worldbook-client";

export const AiNameContext = createContext<string>(DEFAULT_DISPLAY_NAMES.aiName);
export const useAiName = () => useContext(AiNameContext);
