// Generated from src/shared/browser-semantics.ts.
"use strict";
var DextanaPage = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/shared/browser-semantics.ts
  var browser_semantics_exports = {};
  __export(browser_semantics_exports, {
    describeBrowserElements: () => describeBrowserElements
  });
  function describeBrowserElements(nodes, refs, selectFill = true) {
    const references = new Map(nodes.map((element, index) => [element, refs[index]]));
    const labels = /* @__PURE__ */ new Map();
    const related = (element, attribute) => (element.getAttribute(attribute) || "").split(/\s+/).map(
      (id) => element.getRootNode().getElementById?.(id)?.textContent || ""
    ).join(" ").trim();
    const label = (element) => {
      if (!labels.has(element)) {
        const field = element;
        labels.set(
          element,
          String(
            element.getAttribute("aria-label") || related(element, "aria-labelledby") || field.labels && [...field.labels].map((item) => item.textContent).join(" ") || element.getAttribute("placeholder") || (element.matches("input[type=submit],input[type=button],input[type=reset]") ? field.value : "") || element.innerText || element.getAttribute("title") || element.getAttribute("alt") || element.getAttribute("name") || element.textContent || ""
          ).replace(/\s+/g, " ").trim()
        );
      }
      return labels.get(element);
    };
    const roles = {
      BUTTON: "button",
      TEXTAREA: "textbox",
      SUMMARY: "button",
      FORM: "form"
    };
    const inputRoles = {
      checkbox: "checkbox",
      radio: "radio",
      range: "slider",
      number: "spinbutton",
      search: "searchbox",
      submit: "button",
      reset: "button",
      button: "button"
    };
    const interactiveRoles = /* @__PURE__ */ new Set([
      "button",
      "link",
      "textbox",
      "searchbox",
      "combobox",
      "listbox",
      "checkbox",
      "radio",
      "switch",
      "tab",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "slider",
      "spinbutton",
      "treeitem"
    ]);
    const elements = nodes.map((element, index) => {
      const field = element;
      const tag = element.tagName;
      const type = tag === "INPUT" ? field.type : element.getAttribute("type") || "";
      const role = element.getAttribute("role") || roles[tag] || (tag === "A" && element.hasAttribute("href") ? "link" : tag === "SELECT" ? element.multiple ? "listbox" : "combobox" : tag === "INPUT" ? inputRoles[type] || (type === "hidden" ? "" : "textbox") : element.isContentEditable ? "textbox" : "");
      const rect = element.getBoundingClientRect();
      const visible = element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && element.getClientRects().length > 0;
      const disabled = element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
      const readonly = !!field.readOnly || element.getAttribute("aria-readonly") === "true";
      const editable = tag === "TEXTAREA" || tag === "SELECT" && selectFill || element.isContentEditable || tag === "INPUT" && ["text", "search", "email", "url", "tel", "password"].includes(type);
      const clickable = interactiveRoles.has(role) || element.matches("a[href],summary,[onclick]") || element.tabIndex >= 0 || getComputedStyle(element).cursor === "pointer";
      const form = field.form || element.closest("form,[role=form]");
      const actions = !visible || disabled ? [] : [...clickable || editable ? ["click"] : [], ...editable && !readonly ? ["fill"] : []];
      return {
        ref: refs[index],
        tag: tag.toLowerCase(),
        role,
        label: label(element).slice(0, 180),
        label_length: label(element).length,
        type,
        visible,
        in_viewport: visible && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        value: type === "password" ? "[redacted]" : typeof field.value === "string" || typeof field.value === "number" ? String(field.value).slice(0, 200) : "",
        actions,
        ...clickable || editable ? {
          disabled,
          readonly,
          required: !!field.required || element.getAttribute("aria-required") === "true"
        } : {},
        ...form && form !== element ? { form_ref: references.get(form) } : {},
        ...related(element, "aria-describedby") ? { description: related(element, "aria-describedby").slice(0, 300) } : {},
        ...field.validity || element.hasAttribute("aria-invalid") ? {
          invalid: element.getAttribute("aria-invalid") === "true" || field.validity?.valid === false
        } : {},
        ...type === "checkbox" || type === "radio" ? { checked: field.checked } : element.hasAttribute("aria-checked") ? { checked: element.getAttribute("aria-checked") } : {},
        ...element.hasAttribute("aria-expanded") ? { expanded: element.getAttribute("aria-expanded") === "true" } : {},
        ...element.hasAttribute("href") ? { href: element.getAttribute("href") } : {},
        ...tag === "SELECT" ? {
          options: [...element.options].slice(0, 100).map((option) => ({
            value: option.value,
            label: option.label,
            selected: option.selected,
            disabled: option.disabled
          })),
          options_total: element.options.length
        } : {}
      };
    });
    const forms = nodes.filter((element) => element.matches("form,[role=form]")).map((form) => {
      const ref = references.get(form);
      const fields = elements.filter((element) => element.form_ref === ref);
      return {
        ref,
        label: label(form).slice(0, 180),
        fields: fields.filter(
          (element) => ["input", "textarea", "select"].includes(element.tag) || element.actions.includes("fill")
        ).map((element) => element.ref),
        submit_refs: fields.filter(
          (element) => element.actions.includes("click") && (element.type === "submit" || element.tag === "button" && !element.type)
        ).map((element) => element.ref)
      };
    });
    const priority = (element) => element.in_viewport && element.actions.length ? 0 : element.in_viewport && element.required ? 1 : element.in_viewport ? 2 : element.visible && element.actions.length ? 3 : 4;
    elements.sort((a, b) => priority(a) - priority(b));
    return { elements, forms };
  }
  return __toCommonJS(browser_semantics_exports);
})();
