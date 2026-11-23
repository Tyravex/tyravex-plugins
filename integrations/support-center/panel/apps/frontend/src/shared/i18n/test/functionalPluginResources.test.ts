import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { registerFunctionalPluginResources } from "../functionalPluginResources";
import {
  supportCenterPlugin,
  supportCenterTranslations,
} from "@/plugins/support-center/manifest";

describe("functional plugin translations", () => {
  it("keeps PL/EN/DE keys and interpolation parameters complete", () => {
    const keys = Object.keys(supportCenterTranslations.en).sort();
    for (const locale of Object.values(supportCenterTranslations)) {
      expect(Object.keys(locale).sort()).toEqual(keys);
      for (const key of keys) {
        const text = locale[key as keyof typeof locale];
        expect(text.trim()).not.toBe("");
        expect(text).not.toMatch(/\uFFFD|\p{L}\?\p{L}/u);
        expect(text.match(/{{[^}]+}}/g)).toEqual(
          supportCenterTranslations.en[key as keyof typeof locale].match(
            /{{[^}]+}}/g,
          ),
        );
      }
    }
  });
  it("uses its own namespace and English fallback without changing core translations", async () => {
    const instance = createInstance();
    await instance.init({
      lng: "de",
      fallbackLng: "en",
      defaultNS: "translation",
      resources: { de: { translation: { title: "Panel" } } },
    });
    registerFunctionalPluginResources(
      instance,
      supportCenterPlugin,
      supportCenterTranslations,
    );
    expect(instance.t("title")).toBe("Panel");
    expect(
      instance.t("title", { ns: supportCenterPlugin.translations.namespace }),
    ).toBe("Support-Center");
    await instance.changeLanguage("fr");
    expect(
      instance.t("title", { ns: supportCenterPlugin.translations.namespace }),
    ).toBe("Support Center");
  });
  it("rejects attempts to claim the host namespace before registering resources", async () => {
    const instance = createInstance();
    await instance.init();
    expect(() =>
      registerFunctionalPluginResources(
        instance,
        {
          ...supportCenterPlugin,
          translations: {
            ...supportCenterPlugin.translations,
            namespace: "translation" as never,
          },
        },
        supportCenterTranslations,
      ),
    ).toThrow();
    expect(instance.hasResourceBundle("en", "translation")).toBe(false);
  });
});
