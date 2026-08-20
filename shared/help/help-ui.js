(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CVSHelpUI = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const COMMON_INSTRUCTIONS = Object.freeze({
    runtime: Object.freeze({
      heading: "Run / Pause / Resume / Stop / Reset",
      body: "Run starts the program. Pause freezes the program and motion; Resume continues. Stop ends the program at its current position. Reset returns the simulator to its starting state.",
    }),
    blockLibrary: Object.freeze({
      heading: "Block Library",
      body: "Show or hide compatible optional block groups without changing the program in your workspace.",
    }),
  });

  const STORAGE_ITEMS = Object.freeze([
    Object.freeze({
      heading: "Save / Load",
      body: "Stores your project on this browser and device.",
    }),
    Object.freeze({
      heading: "Export / Import",
      body: "Creates or opens a portable project file that can be moved between devices.",
    }),
  ]);

  function validateContent(content) {
    if (!content || typeof content !== "object") throw new TypeError("Help content is required.");
    if (!content.title || !content.purpose) throw new TypeError("Help content needs a title and purpose.");
    if (!Array.isArray(content.instructions) || content.instructions.length === 0) {
      throw new TypeError("Help content needs at least one instruction.");
    }

    content.instructions.forEach((instruction) => {
      if (instruction.common) {
        if (!COMMON_INSTRUCTIONS[instruction.common]) {
          throw new TypeError(`Unknown common Help instruction: ${instruction.common}`);
        }
        return;
      }
      if (!instruction.heading || !instruction.body) {
        throw new TypeError("Each Help instruction needs a heading and body.");
      }
    });
    return true;
  }

  function resolveInstruction(instruction) {
    return instruction.common ? COMMON_INSTRUCTIONS[instruction.common] : instruction;
  }

  function appendTextElement(documentTarget, parent, tagName, className, text) {
    const element = documentTarget.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function appendInstructionList(documentTarget, parent, instructions) {
    const list = documentTarget.createElement("ul");
    list.className = "help-list";
    instructions.map(resolveInstruction).forEach((instruction) => {
      const item = documentTarget.createElement("li");
      appendTextElement(documentTarget, item, "h4", "help-item-heading", instruction.heading);
      appendTextElement(documentTarget, item, "p", "help-item-body", instruction.body);
      list.appendChild(item);
    });
    parent.appendChild(list);
  }

  function mount(content, options = {}) {
    validateContent(content);
    const documentTarget = options.document || (typeof document !== "undefined" ? document : null);
    if (!documentTarget) return null;

    const button = documentTarget.getElementById(options.buttonId || "help-button");
    if (!button) throw new Error("The Help button could not be found.");

    const existing = documentTarget.getElementById("help-dialog");
    if (existing) return existing.cvsHelpController || null;

    const dialog = documentTarget.createElement("dialog");
    dialog.id = "help-dialog";
    dialog.className = "help-dialog";
    dialog.setAttribute("aria-labelledby", "help-heading");
    dialog.setAttribute("aria-describedby", "help-purpose");

    const panel = documentTarget.createElement("article");
    panel.className = "help-panel";

    const header = documentTarget.createElement("header");
    header.className = "help-header";
    const titleGroup = documentTarget.createElement("div");
    appendTextElement(documentTarget, titleGroup, "p", "help-kicker", "SIMULATOR HELP");
    const heading = appendTextElement(documentTarget, titleGroup, "h2", "help-title", content.title);
    heading.id = "help-heading";
    header.appendChild(titleGroup);

    const closeButton = appendTextElement(documentTarget, header, "button", "help-close-button", "Close Help");
    closeButton.type = "button";
    panel.appendChild(header);

    const body = documentTarget.createElement("div");
    body.className = "help-body";

    const purposeSection = documentTarget.createElement("section");
    purposeSection.className = "help-section help-purpose";
    appendTextElement(documentTarget, purposeSection, "h3", "help-section-heading", "Purpose");
    const purpose = appendTextElement(documentTarget, purposeSection, "p", null, content.purpose);
    purpose.id = "help-purpose";
    body.appendChild(purposeSection);

    const instructionsSection = documentTarget.createElement("section");
    instructionsSection.className = "help-section";
    appendTextElement(documentTarget, instructionsSection, "h3", "help-section-heading", "Using the simulator");
    appendInstructionList(documentTarget, instructionsSection, content.instructions);
    body.appendChild(instructionsSection);

    const storageSection = documentTarget.createElement("section");
    storageSection.className = "help-section help-storage";
    appendTextElement(documentTarget, storageSection, "h3", "help-section-heading", "Save or move your project");
    appendInstructionList(documentTarget, storageSection, STORAGE_ITEMS);
    body.appendChild(storageSection);

    panel.appendChild(body);
    dialog.appendChild(panel);
    documentTarget.body.appendChild(dialog);

    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", dialog.id);
    let opener = null;

    function open() {
      opener = documentTarget.activeElement;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      requestAnimationFrame(() => closeButton.focus());
    }

    function close() {
      if (typeof dialog.close === "function") dialog.close();
      else {
        dialog.removeAttribute("open");
        if (opener && opener.isConnected) opener.focus();
      }
    }

    button.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    dialog.addEventListener("close", () => {
      if (opener && opener.isConnected) opener.focus();
    });
    dialog.addEventListener("pointerdown", (event) => {
      if (event.target === dialog) close();
    });

    const controller = Object.freeze({ dialog, open, close });
    dialog.cvsHelpController = controller;
    return controller;
  }

  return Object.freeze({
    commonInstructions: COMMON_INSTRUCTIONS,
    storageItems: STORAGE_ITEMS,
    validateContent,
    resolveInstruction,
    mount,
  });
});
