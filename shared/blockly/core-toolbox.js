(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CVSCoreToolbox = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const STORAGE_PREFIX = "cvs-block-library-v1:";

  function storageKey(appId) {
    return `${STORAGE_PREFIX}${appId}`;
  }

  function defaultsFor(packs) {
    return Object.fromEntries((packs || []).map((pack) => [pack.id, pack.defaultEnabled !== false]));
  }

  function readPreferences(appId, packs, storage) {
    const preferences = defaultsFor(packs);
    const targetStorage = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!targetStorage) return preferences;

    try {
      const stored = JSON.parse(targetStorage.getItem(storageKey(appId)) || "null");
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        (packs || []).forEach((pack) => {
          if (typeof stored[pack.id] === "boolean") preferences[pack.id] = stored[pack.id];
        });
      }
    } catch (error) {
      console.error(error);
    }
    return preferences;
  }

  function writePreferences(appId, preferences, storage) {
    const targetStorage = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!targetStorage) return;
    targetStorage.setItem(storageKey(appId), JSON.stringify(preferences));
  }

  function enabledPackIds(preferences) {
    return new Set(Object.keys(preferences || {}).filter((id) => preferences[id] !== false));
  }

  function setup(options) {
    const {
      appId,
      packs,
      workspace,
      getToolbox,
      button,
      dialog,
      list,
      closeButton,
      storage,
    } = options;
    const preferences = readPreferences(appId, packs, storage);

    function refreshToolbox() {
      if (workspace) workspace.updateToolbox(getToolbox(preferences));
    }

    function render() {
      list.replaceChildren();
      packs.forEach((pack) => {
        const label = document.createElement("label");
        label.className = "block-pack-option";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = preferences[pack.id] !== false;
        input.dataset.packId = pack.id;

        const copy = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = pack.label;
        const description = document.createElement("small");
        description.textContent = pack.description;
        copy.append(name, description);
        label.append(input, copy);
        list.appendChild(label);

        input.addEventListener("change", () => {
          preferences[pack.id] = input.checked;
          writePreferences(appId, preferences, storage);
          refreshToolbox();
        });
      });
    }

    function open() {
      render();
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }

    function close() {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }

    button.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });

    refreshToolbox();

    return Object.freeze({ preferences, refreshToolbox, open, close });
  }

  return Object.freeze({ storageKey, defaultsFor, readPreferences, writePreferences, enabledPackIds, setup });
});
