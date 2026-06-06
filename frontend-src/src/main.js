const app = document.querySelector("#app");

window.__MIKAZUKI__ = {
  SAMPLE_PROMPTS_DEFAULT:
    "(masterpiece, best quality:1.2), 1girl, solo, --n lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts,signature, watermark, username, blurry,  --w 512  --h 768  --l 7  --s 24  --d 1337",
  SAMPLE_PROMPTS_DESCRIPTION:
    "预览图生成参数。可填写直接填写参数，或单独写入txt文件填写路径<br>`--n` 后方为反向提示词<br>`--w`宽，`--h`高<br>`--l`: CFG Scale<br>`--s`: 迭代步数<br>`--d`: 种子",
};

const routes = [
  { path: "/", title: "LoRA-Forge", view: "home" },
  { path: "/lora/index.html", alias: "/lora/index.md", title: "LoRA 训练", view: "info", schema: null },
  { path: "/lora/master.html", alias: "/lora/master.md", title: "Stable Diffusion", view: "trainer", schema: "lora-master" },
  { path: "/lora/flux.html", alias: "/lora/flux.md", title: "Flux", view: "trainer", schema: "flux-lora" },
  { path: "/lora/anima.html", alias: "/lora/anima.md", title: "Anima", view: "trainer", schema: "anima-lora" },
  { path: "/lora/sd3.html", alias: "/lora/sd3.md", title: "SD3.5", view: "trainer", schema: "sd3-lora" },
  { path: "/lora/basic.html", alias: "/lora/basic.md", title: "SD1.5", view: "trainer", schema: "lora-basic" },
  { path: "/dreambooth/index.html", alias: "/dreambooth/index.md", title: "Dreambooth", view: "trainer", schema: "dreambooth" },
  { path: "/task.html", alias: "/task.md", title: "任务", view: "tasks" },
  { path: "/tensorboard.html", alias: "/tensorboard.md", title: "Tensorboard", view: "proxy", proxy: "/proxy/tensorboard/", service: "tensorboard" },
  { path: "/tagger.html", alias: "/tagger.md", title: "Tagger", view: "tagger" },
  { path: "/tageditor.html", alias: "/tageditor.md", title: "标签编辑器", view: "proxy", proxy: "/proxy/tageditor/", service: "tageditor" },
  { path: "/other/settings.html", alias: "/other/settings.md", title: "UI 设置", view: "settings" },
  { path: "/other/about.html", alias: "/other/about.md", title: "关于", view: "home" },
];

const state = {
  schemas: new Map(),
  sharedSchemas: null,
  cards: [],
  current: {},
  currentRoute: null,
  collapsedSections: new Set(),
  fields: [],
  initialFieldValues: new Map(),
  message: "",
  runtime: null,
};

class SchemaNode {
  constructor(type, data = {}) {
    this.type = type;
    Object.assign(this, data);
    this.meta = {};
  }

  default(value) {
    this.meta.default = value;
    return this;
  }

  description(value) {
    this.meta.description = value;
    return this;
  }

  role(name, options = {}) {
    this.meta.role = { name, options };
    return this;
  }

  min(value) {
    this.meta.min = value;
    return this;
  }

  max(value) {
    this.meta.max = value;
    return this;
  }

  step(value) {
    this.meta.step = value;
    return this;
  }

  required() {
    this.meta.required = true;
    return this;
  }

  disabled() {
    this.meta.disabled = true;
    return this;
  }
}

const Schema = {
  string: () => new SchemaNode("string"),
  number: () => new SchemaNode("number"),
  boolean: () => new SchemaNode("boolean"),
  const: (value) => new SchemaNode("const", { value }).default(value),
  array: (item) => new SchemaNode("array", { item }),
  object: (fields) => new SchemaNode("object", { fields }),
  intersect: (items) => new SchemaNode("intersect", { items }),
  union: (items) => {
    const literals = items.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
    return new SchemaNode(literals ? "enum" : "union", literals ? { options: items } : { items });
  },
};

function UpdateSchema(base, updates = {}, removes = []) {
  const result = { ...base };
  for (const key of removes) delete result[key];
  return { ...result, ...updates };
}

function evaluateSchema(source, sharedSchemas) {
  const trimmed = source.trim().replace(/;\s*$/, "");
  return new Function("Schema", "SHARED_SCHEMAS", "UpdateSchema", "window", `"use strict"; return (${trimmed});`)(
    Schema,
    sharedSchemas,
    UpdateSchema,
    window,
  );
}

async function api(path, options) {
  const response = await fetch(path, options);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const hint = text.trim().startsWith("<")
      ? "API 返回了 HTML。请通过 Python GUI 后端访问页面，而不是只用静态文件服务器。"
      : "API 返回了无法解析的内容。";
    throw new Error(`${hint} (${path})`);
  }
  if (json.status === "fail") throw new Error(json.message || "请求失败");
  return { message: json.message, ...json.data } ?? {};
}

async function loadSchemas() {
  const data = await api("/api/schemas/all");
  const rawSchemas = data.schemas ?? [];
  const shared = rawSchemas.find((schema) => schema.name === "shared");
  state.sharedSchemas = shared ? evaluateSchema(shared.schema, null) : {};

  for (const entry of rawSchemas) {
    if (entry.name === "shared") continue;
    try {
      state.schemas.set(entry.name, evaluateSchema(entry.schema, state.sharedSchemas));
    } catch (error) {
      console.warn(`Failed to evaluate schema ${entry.name}`, error);
    }
  }
  state.cards = await loadGraphicCards();
}

async function loadRuntime() {
  try {
    state.runtime = await api("/api/runtime");
  } catch (error) {
    console.warn("Failed to load runtime information", error);
    state.runtime = { services: {} };
  }
}

async function loadGraphicCards() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("/api/graphic_cards");
      const result = await response.json();
      if (result.status === "success") return result.data?.cards ?? [];
      if (result.status !== "pending") return [];
    } catch (error) {
      console.warn("Failed to load GPU list", error);
      return [];
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return [];
}

function routeFor(pathname) {
  return routes.find((route) => route.path === pathname || route.alias === pathname) ?? routes[0];
}

function flattenSchema(schema) {
  const groups = [];
  const seen = new Set();

  function visit(node, fallbackTitle = "参数") {
    if (!node) return;
    if (node.type === "intersect") {
      for (const item of node.items) visit(item, fallbackTitle);
      return;
    }
    if (node.type === "union") {
      for (const item of node.items) visit(item, fallbackTitle);
      return;
    }
    if (node.type !== "object") return;

    const fields = [];
    for (const [name, field] of Object.entries(node.fields ?? {})) {
      if (seen.has(name)) continue;
      seen.add(name);
      fields.push({ name, schema: field });
    }
    if (fields.length) {
      const title = node.meta.description || inferGroupTitle(fields, fallbackTitle);
      const group = groups.find((item) => item.title === title);
      if (group) group.fields.push(...fields);
      else groups.push({ title, fields });
    }
  }

  visit(schema);
  return normalizeGroups(groups);
}

function normalizeGroups(groups) {
  const normalized = groups
    .map((group) => ({
      ...group,
      title: normalizeGroupTitle(group.title),
      fields: group.fields.filter((field) => field.name !== "ui_custom_params"),
    }))
    .filter((group) => group.fields.length);

  moveFieldToGroup(normalized, "seed", "训练相关参数");
  return normalized;
}

function normalizeGroupTitle(title) {
  if (title === "caption（Tag）选项") return "Caption 设置";
  return title;
}

function moveFieldToGroup(groups, fieldName, targetTitle) {
  let movedField = null;
  for (const group of groups) {
    const index = group.fields.findIndex((field) => field.name === fieldName);
    if (index >= 0) {
      [movedField] = group.fields.splice(index, 1);
      break;
    }
  }
  if (!movedField) return;

  let target = groups.find((group) => group.title === targetTitle);
  if (!target) {
    target = { title: targetTitle, fields: [] };
    groups.push(target);
  }
  target.fields.push(movedField);

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    if (!groups[index].fields.length) groups.splice(index, 1);
  }
}

function inferGroupTitle(fields, fallbackTitle = "参数") {
  const names = new Set(fields.map((field) => field.name));
  if (hasAny(names, ["model_train_type", "pretrained_model_name_or_path", "qwen3", "vae", "clip_l", "clip_g", "t5xxl", "v2", "v_parameterization", "scale_v_pred_loss_like_noise_pred"])) return "训练用模型";
  if (hasAny(names, ["train_data_dir", "resolution", "enable_bucket", "bucket_no_upscale"])) return "数据集设置";
  if (hasAny(names, ["output_name", "output_dir", "save_model_as", "save_state", "save_last_n_epochs_state"])) return "保存设置";
  if (hasAny(names, ["max_train_epochs", "train_batch_size", "gradient_checkpointing", "seed"])) return "训练相关参数";
  if (hasAny(names, ["optimizer_type", "learning_rate", "lr_scheduler", "lr_scheduler_num_cycles", "unet_lr", "text_encoder_lr", "optimizer_args_custom"])) return "学习率与优化器设置";
  if (hasAny(names, ["loss_type", "huber_schedule", "huber_c", "min_snr_gamma", "debiased_estimation_loss"])) return "损失设置";
  if (hasAny(names, ["prodigy_d0", "prodigyplus_d_coef"])) return "优化器专用参数";
  if (hasAny(names, ["network_module", "network_dim", "network_alpha", "network_weights"])) return "网络设置";
  if (hasAny(names, ["lycoris_algo", "conv_dim", "conv_alpha", "lokr_factor", "dylora_unit"])) return "网络专用参数";
  if (hasAny(names, ["enable_base_weight", "base_weights", "base_weights_multiplier"])) return "基础权重设置";
  if (hasAny(names, ["enable_block_weights", "down_lr_weight", "mid_lr_weight", "up_lr_weight"])) return "分层学习率设置";
  if (hasAny(names, ["enable_preview", "sample_prompts", "positive_prompts", "sample_width"])) return "训练预览图设置";
  if (hasAny(names, ["log_with", "logging_dir", "wandb_api_key"])) return "日志设置";
  if (hasAny(names, ["caption_extension", "shuffle_caption", "keep_tokens", "max_token_length"])) return "Caption 设置";
  if (hasAny(names, ["noise_offset", "multires_noise_iterations"])) return "噪声设置";
  if (hasAny(names, ["color_aug", "flip_aug", "random_crop"])) return "数据增强";
  if (hasAny(names, ["mixed_precision", "xformers", "sdpa", "cache_latents", "attn_mode"])) return "速度优化选项";
  if (hasAny(names, ["ddp_timeout", "ddp_gradient_as_bucket_view"])) return "分布式训练";
  if (hasAny(names, ["clip_skip"])) return "其他设置";
  return fallbackTitle;
}

function hasAny(names, candidates) {
  return candidates.some((candidate) => names.has(candidate));
}

function withGpuSelector(groups) {
  if (state.cards.length < 2) return groups;
  return [
    ...groups,
    {
      title: "显卡设置",
      fields: [
        {
          name: "gpu_ids",
          schema: Schema.array(Schema.union(state.cards)).description("选择显卡").role("select"),
        },
      ],
    },
  ];
}

function withFrontendOptimizerFields(groups) {
  const allNames = new Set(groups.flatMap((group) => group.fields.map((field) => field.name)));
  const optimizerGroup = groups.find((group) => group.fields.some((field) => field.name === "optimizer_type"));
  const optimizerField = optimizerGroup?.fields.find((field) => field.name === "optimizer_type");
  const optimizerOptions = optimizerField ? schemaOptions(optimizerField.schema) ?? [] : [];

  if (!optimizerOptions.includes("prodigyplus.ProdigyPlusScheduleFree")) return groups;

  const fields = [];
  if (!allNames.has("prodigy_d0")) {
    fields.push({
      name: "prodigy_d0",
      schema: Schema.string().description("Prodigy d0。初始 LR 猜测，可尝试 1e-7、1e-6、1e-5"),
    });
  }
  if (!allNames.has("prodigy_d_coef")) {
    fields.push({
      name: "prodigy_d_coef",
      schema: Schema.string().default("2.0").description("Prodigy d_coef。默认 2.0"),
    });
  }
  if (!allNames.has("prodigyplus_d_coef")) {
    fields.push({
      name: "prodigyplus_d_coef",
      schema: Schema.string().default("1.0").description("Prodigy Plus d_coef。官方默认 1.0，可尝试 2 或更高帮助 LR 增长"),
    });
  }
  if (!allNames.has("prodigyplus_betas")) {
    fields.push({
      name: "prodigyplus_betas",
      schema: Schema.string().default("(0.9, 0.99)").description("Prodigy Plus betas，Python tuple 格式，例如 (0.95, 0.99)"),
    });
  }
  if (!allNames.has("prodigyplus_schedulefree_c")) {
    fields.push({
      name: "prodigyplus_schedulefree_c",
      schema: Schema.string().default("0").description("Prodigy Plus schedulefree_c。官方默认 0"),
    });
  }

  if (!fields.length) return groups;
  return [...groups, { title: "优化器专用参数", fields }];
}

function withFrontendAnimaNetworkArgsFields(groups, schemaName) {
  if (schemaName !== "anima-lora") return groups;

  const allNames = new Set(groups.flatMap((group) => group.fields.map((field) => field.name)));
  const fields = [];
  if (!allNames.has("network_reg_dims")) {
    fields.push({
      name: "network_reg_dims",
      schema: Schema.string()
        .default("")
        .description("Anima 正则 rank 控制，格式：pattern=rank,pattern=rank。例如：.*self_attn.*=8,.*cross_attn.*=4,.*mlp.*=8"),
    });
  }
  if (!allNames.has("network_reg_lrs")) {
    fields.push({
      name: "network_reg_lrs",
      schema: Schema.string()
        .default("")
        .description("Anima 正则学习率控制，格式：pattern=lr,pattern=lr。例如：.*self_attn.*=1e-4,.*cross_attn.*=5e-5"),
    });
  }

  if (!fields.length) return groups;
  const networkGroup = groups.find((group) => group.fields.some((field) => field.name === "network_module"));
  if (networkGroup) {
    networkGroup.fields.push(...fields);
    return groups;
  }
  return [...groups, { title: "网络设置", fields }];
}

function defaultFor(field) {
  if (Object.hasOwn(field.meta, "default")) return field.meta.default;
  if (field.type === "boolean") return false;
  if (field.type === "array") return [];
  if (field.type === "const") return field.value;
  return "";
}

function isResolutionField(name) {
  return name === "resolution";
}

function formatResolutionForInput(value) {
  const parsed = parseResolutionValue(value);
  return parsed ? `${parsed[0]}x${parsed[1]}` : value;
}

function normalizeResolutionForConfig(value) {
  const parsed = parseResolutionValue(value);
  return parsed ? `${parsed[0]},${parsed[1]}` : String(value).trim();
}

function parseResolutionValue(value) {
  const match = String(value).trim().match(/^(\d+)\s*(?:[xX×,])\s*(\d+)$/);
  return match ? [match[1], match[2]] : null;
}

function defaultsFrom(groups) {
  const values = {};
  for (const group of groups) {
    for (const field of group.fields) values[field.name] = defaultFor(field.schema);
  }
  return values;
}

function schemaOptions(field) {
  if (field.type === "enum") return field.options;
  if (field.type === "const") return [field.value];
  if (field.type === "array" && field.item?.type === "enum") return field.item.options;
  return null;
}

function fieldType(field) {
  if (field.type === "number") return "number";
  if (field.type === "boolean") return "checkbox";
  if (field.meta.role?.name === "textarea" || field.meta.role?.name === "table" || field.type === "array") return "textarea";
  return "text";
}

function cleanConfig(values, groups) {
  const config = {};
  const fieldMap = new Map(groups.flatMap((group) => group.fields.map((field) => [field.name, field.schema])));
  for (const [name, value] of Object.entries(values)) {
    const schema = fieldMap.get(name);
    if (!schema) continue;
    if (schema.type !== "boolean" && schema.type !== "const" && value === "") continue;
    if (schema.type === "number") config[name] = Number(value);
    else if (schema.type === "array") config[name] = Array.isArray(value) ? value : String(value).split(/\r?\n/).filter(Boolean);
    else config[name] = value;
  }
  normalizeTrainingConfig(config);
  return config;
}

function normalizeTrainingConfig(config) {
  config.network_args ??= [];
  config.optimizer_args ??= [];

  coerceNumericStrings(config, [
    "learning_rate",
    "unet_lr",
    "text_encoder_lr",
    "learning_rate_te",
    "learning_rate_te1",
    "learning_rate_te2",
  ]);

  appendNetworkArg(config, "network_reg_dims");
  appendNetworkArg(config, "network_reg_lrs");

  if (config.network_module === "lycoris.kohya") {
    if (config.conv_dim !== undefined) config.network_args.push(`conv_dim=${config.conv_dim}`);
    if (config.conv_alpha !== undefined) config.network_args.push(`conv_alpha=${config.conv_alpha}`);
    if (config.dropout !== undefined) config.network_args.push(`dropout=${config.dropout}`);
    if (config.lycoris_algo) config.network_args.push(`algo=${config.lycoris_algo}`);
    if (config.lokr_factor) config.network_args.push(`factor=${config.lokr_factor}`);
    if (config.train_norm) config.network_args.push("train_norm=True");
  } else if (config.network_module === "networks.dylora") {
    if (config.dylora_unit !== undefined) config.network_args.push(`unit=${config.dylora_unit}`);
  }

  applyOptimizerRuleToConfig(config);

  if (!["huber", "smooth_l1"].includes(config.loss_type)) {
    delete config.huber_schedule;
    delete config.huber_c;
  }

  if (!["sd-lora", "sdxl-lora", "sd-dreambooth", "sdxl-finetune"].includes(config.model_train_type)) {
    delete config.v2;
    delete config.v_parameterization;
  }
  if (!["sd-lora", "sd-dreambooth"].includes(config.model_train_type)) delete config.v2;
  if (!config.v_parameterization) delete config.scale_v_pred_loss_like_noise_pred;

  if (config.enable_block_weights) {
    if (config.down_lr_weight !== undefined) config.network_args.push(`down_lr_weight=${config.down_lr_weight}`);
    if (config.mid_lr_weight !== undefined) config.network_args.push(`mid_lr_weight=${config.mid_lr_weight}`);
    if (config.up_lr_weight !== undefined) config.network_args.push(`up_lr_weight=${config.up_lr_weight}`);
    if (config.block_lr_zero_threshold !== undefined) config.network_args.push(`block_lr_zero_threshold=${config.block_lr_zero_threshold}`);
  }

  if (config.enable_base_weight) {
    if (typeof config.base_weights === "string") config.base_weights = config.base_weights.split(/\r?\n/).filter(Boolean);
    if (typeof config.base_weights_multiplier === "string") {
      config.base_weights_multiplier = config.base_weights_multiplier.split(/\r?\n/).filter(Boolean).map(Number);
    }
  } else {
    delete config.base_weights;
    delete config.base_weights_multiplier;
  }

  if (Array.isArray(config.network_args_custom)) config.network_args.push(...config.network_args_custom.filter(Boolean));
  if (Array.isArray(config.optimizer_args_custom)) config.optimizer_args.push(...config.optimizer_args_custom.filter(Boolean));

  if (config.full_precision === "full_fp16") {
    config.full_fp16 = true;
    config.full_bf16 = false;
  } else if (config.full_precision === "full_bf16") {
    config.full_fp16 = false;
    config.full_bf16 = true;
  } else if (config.full_precision === "none") {
    config.full_fp16 = false;
    config.full_bf16 = false;
  }
  delete config.full_precision;

  if (!config.enable_preview) {
    for (const key of [
      "randomly_choice_prompt",
      "prompt_file",
      "positive_prompts",
      "negative_prompts",
      "sample_width",
      "sample_height",
      "sample_cfg",
      "sample_seed",
      "sample_steps",
      "sample_sampler",
      "sample_every_n_epochs",
      "sample_prompts",
    ]) delete config[key];
  }

  for (const key of Object.keys(config)) {
    if (typeof config[key] === "string" && /(_dir|_path|weights|vae|qwen3|t5xxl|clip_l|clip_g|ae|resume)$/.test(key)) {
      config[key] = config[key].replaceAll("\\", "/");
    }
    if (config[key] === "" || (Array.isArray(config[key]) && config[key].length === 0)) delete config[key];
  }

  for (const key of [
    "network_args_custom",
    "network_reg_dims",
    "network_reg_lrs",
    "optimizer_args_custom",
    "enable_base_weight",
    "enable_block_weights",
    "enable_preview",
    "conv_dim",
    "conv_alpha",
    "dropout",
    "lycoris_algo",
    "lokr_factor",
    "dylora_unit",
    "down_lr_weight",
    "mid_lr_weight",
    "up_lr_weight",
    "block_lr_zero_threshold",
    "train_norm",
    "prodigy_d0",
    "prodigy_d_coef",
    "prodigyplus_d_coef",
    "prodigyplus_betas",
    "prodigyplus_schedulefree_c",
    "ui_custom_params",
  ]) delete config[key];

  if (!config.network_args?.length) delete config.network_args;
  if (!config.optimizer_args?.length) delete config.optimizer_args;
}

function coerceNumericStrings(config, names) {
  for (const name of names) {
    if (typeof config[name] !== "string") continue;
    const value = config[name].trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) continue;
    config[name] = Number(value);
  }
}

function appendNetworkArg(config, name) {
  const value = typeof config[name] === "string" ? config[name].trim() : config[name];
  if (value !== undefined && value !== "") config.network_args.push(`${name}=${value}`);
}

function renderShell(route) {
  app.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="/">
        <img class="brand-logo" src="/assets/logo.svg" alt="" />
        <span>LoRA-Forge</span>
      </a>
      <nav>
        <a href="/lora/index.html">LoRA 训练</a>
        <a href="/lora/master.html">Stable Diffusion</a>
        <a href="/lora/flux.html">Flux</a>
        <a href="/lora/anima.html">Anima</a>
        <a href="/lora/sd3.html">SD3.5</a>
        <a href="/lora/basic.html">SD1.5</a>
        <a href="/dreambooth/index.html">Dreambooth</a>
        <a href="/task.html">任务</a>
        <a href="/tagger.html">Tagger</a>
        <a href="/tensorboard.html">Tensorboard</a>
        <a href="/other/settings.html">设置</a>
      </nav>
    </aside>
    <main class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">Training UI</p>
          <h1>${escapeHtml(route.title)}</h1>
        </div>
        <span id="status">${escapeHtml(state.message)}</span>
      </header>
      <section id="content"></section>
    </main>
  `;
  for (const link of app.querySelectorAll(".sidebar a")) {
    if (link.getAttribute("href") === route.path) link.classList.add("active");
  }
}

function renderHome() {
  content().innerHTML = `
    <section class="panel">
      <h2>Stable Diffusion 训练 UI</h2>
      <p>这是从源码重建的轻量前端。当前目标是让训练 schema、Anima 页面和后端训练入口先稳定工作。</p>
    </section>
  `;
}

function renderInfo(route) {
  content().innerHTML = `
    <section class="panel">
      <h2>${escapeHtml(route.title)}</h2>
      <p>选择左侧训练模式开始配置参数。</p>
    </section>
  `;
}

function renderTrainer(route) {
  const schema = state.schemas.get(route.schema);
  if (!schema) {
    content().innerHTML = `<section class="panel error">未找到 schema: ${escapeHtml(route.schema)}</section>`;
    return;
  }

  const groups = withGpuSelector(withFrontendAnimaNetworkArgsFields(withFrontendOptimizerFields(flattenSchema(schema)), route.schema));
  state.fields = groups;
  state.currentRoute = route;
  state.current = { ...defaultsFrom(groups), ...(route.defaults ?? {}) };

  content().innerHTML = `
    <form id="trainer-form" class="trainer">
      <div class="form-grid">
        ${groups.map((group, index) => renderGroup(group, index)).join("")}
      </div>
      <aside class="actions">
        <section class="action-group action-train">
          <h2>训练</h2>
          <button type="submit" class="primary">开始训练</button>
          <button type="button" id="stop-training" class="danger">终止训练</button>
        </section>
        <section class="action-group action-config">
          <h2>配置</h2>
          <button type="button" id="reset-form">全部重置</button>
          <div class="config-action-row">
            <button type="button" id="export-config" class="download-button">下载配置 JSON</button>
            <label class="import-button import-config-button">导入配置 JSON<input id="import-config" type="file" accept="application/json" /></label>
          </div>
          <div class="config-action-row">
            <button type="button" id="export-toml" class="download-button">下载配置 TOML</button>
            <label class="import-button import-config-button">导入配置 TOML<input id="import-toml" type="file" accept=".toml,text/plain" /></label>
          </div>
        </section>
        <section class="generated-args">
          <h2>优化器参数预览</h2>
          <div id="generated-args" class="args-preview"></div>
        </section>
        <section class="config-preview">
          <h2>TOML 配置预览</h2>
          <pre id="preview"></pre>
        </section>
      </aside>
    </form>
  `;

  bindForm(groups);
  updatePreview(groups);
}

function renderGroup(group, index = 0) {
  const key = sectionCollapseKey(group.title, index);
  const collapsed = state.collapsedSections.has(key);
  const note = group.title === "学习率与优化器设置"
    ? `<p class="section-note">切换优化器时，部分学习率、调度器和 optimizer_args 会按优化器推荐值自动重置。</p>`
    : group.title === "损失设置"
      ? `<p class="section-note">Min-SNR 和 Debiased Estimation loss 作用相近，通常不建议同时启用。</p>`
    : "";
  return `
    <section class="panel form-section ${sectionToneClass(group.title)} ${collapsed ? "is-collapsed" : ""}" data-section-key="${escapeAttr(key)}">
      <button
        type="button"
        class="section-header"
        data-collapse-section="${escapeAttr(key)}"
        aria-expanded="${collapsed ? "false" : "true"}"
      >
        <span class="section-title">${escapeHtml(group.title)}</span>
        <span class="section-toggle-icon" aria-hidden="true">${collapsed ? "+" : "-"}</span>
      </button>
      <div class="section-body">
        ${note}
        ${group.fields.map((field) => renderField(field.name, field.schema)).join("")}
      </div>
    </section>
  `;
}

function sectionCollapseKey(title, index) {
  return `${state.currentRoute?.path ?? location.pathname}:${index}:${title}`;
}

function sectionToneClass(title) {
  if (/模型|Model/i.test(title)) return "section-tone-model";
  if (/数据集|caption|Tag/i.test(title)) return "section-tone-data";
  if (/保存|输出/i.test(title)) return "section-tone-save";
  if (/学习率|优化器|损失/i.test(title)) return "section-tone-optimize";
  if (/网络|基础权重|分层/i.test(title)) return "section-tone-network";
  if (/预览图|日志|Tensorboard|wandb/i.test(title)) return "section-tone-observe";
  if (/噪声|增强|速度|精度|分布式|显卡/i.test(title)) return "section-tone-performance";
  return "section-tone-general";
}

function renderField(name, schema) {
  const id = `field-${name}`;
  const rawValue = Object.hasOwn(state.current, name) ? state.current[name] : defaultFor(schema);
  const value = isResolutionField(name) ? formatResolutionForInput(rawValue) : rawValue;
  const options = schemaOptions(schema);
  const description = schema.meta.description ? `<p class="hint">${schema.meta.description}</p>` : "";
  const disabled = schema.meta.disabled ? "disabled" : "";
  const visibleWhen = visibilityRule(name);
  const visibleValues = visibleWhen ? (Array.isArray(visibleWhen.value) ? visibleWhen.value : [visibleWhen.value]).map(String) : [];
  const visibilityAttrs = visibleWhen
    ? `data-visible-field="${escapeAttr(visibleWhen.field)}" data-visible-value="${escapeAttr(JSON.stringify(visibleValues))}" hidden`
    : "";

  let control = "";
  if (options) {
    const multiple = schema.type === "array" ? "multiple" : "";
    const selectedValues = Array.isArray(value) ? value : [value];
    control = `<select id="${id}" name="${name}" ${multiple} ${disabled}>${options
      .map((option) => `<option value="${escapeAttr(option)}" ${selectedValues.includes(option) ? "selected" : ""}>${escapeHtml(option)}</option>`)
      .join("")}</select>`;
  } else if (fieldType(schema) === "checkbox") {
    control = `<input id="${id}" name="${name}" type="checkbox" ${value ? "checked" : ""} ${disabled} />`;
  } else if (fieldType(schema) === "textarea") {
    const text = Array.isArray(value) ? value.join("\n") : value;
    control = `<textarea id="${id}" name="${name}" rows="4" ${disabled}>${escapeHtml(text)}</textarea>`;
  } else {
    const min = schema.meta.min !== undefined ? `min="${schema.meta.min}"` : "";
    const max = schema.meta.max !== undefined ? `max="${schema.meta.max}"` : "";
    const step = schema.meta.step !== undefined ? `step="${schema.meta.step}"` : (fieldType(schema) === "number" ? `step="any"` : "");
    control = `<input id="${id}" name="${name}" type="${fieldType(schema)}" value="${escapeAttr(value)}" ${min} ${max} ${step} ${disabled} />`;
  }

  const role = schema.meta.role;
  const picker = role?.name === "filepicker" ? `<button type="button" class="icon-button" data-pick="${name}" data-pick-type="${role.options.type || "folder"}">选择</button>` : "";

  return `
    <label class="field" for="${id}" ${visibilityAttrs}>
      <span>${escapeHtml(name)}</span>
      <div class="control-row">${control}${picker}</div>
      ${description}
    </label>
  `;
}

function visibilityRule(name) {
  const rules = {
    prodigy_d0: ["optimizer_type", "Prodigy"],
    prodigy_d_coef: ["optimizer_type", "Prodigy"],
    prodigyplus_d_coef: ["optimizer_type", "prodigyplus.ProdigyPlusScheduleFree"],
    prodigyplus_betas: ["optimizer_type", "prodigyplus.ProdigyPlusScheduleFree"],
    prodigyplus_schedulefree_c: ["optimizer_type", "prodigyplus.ProdigyPlusScheduleFree"],
    lycoris_algo: ["network_module", "lycoris.kohya"],
    conv_dim: ["network_module", "lycoris.kohya"],
    conv_alpha: ["network_module", "lycoris.kohya"],
    dropout: ["network_module", "lycoris.kohya"],
    train_norm: ["network_module", "lycoris.kohya"],
    lokr_factor: ["lycoris_algo", "lokr"],
    dylora_unit: ["network_module", "networks.dylora"],
    base_weights: ["enable_base_weight", true],
    base_weights_multiplier: ["enable_base_weight", true],
    down_lr_weight: ["enable_block_weights", true],
    mid_lr_weight: ["enable_block_weights", true],
    up_lr_weight: ["enable_block_weights", true],
    block_lr_zero_threshold: ["enable_block_weights", true],
    randomly_choice_prompt: ["enable_preview", true],
    prompt_file: ["enable_preview", true],
    positive_prompts: ["enable_preview", true],
    negative_prompts: ["enable_preview", true],
    sample_width: ["enable_preview", true],
    sample_height: ["enable_preview", true],
    sample_cfg: ["enable_preview", true],
    sample_seed: ["enable_preview", true],
    sample_steps: ["enable_preview", true],
    sample_sampler: ["enable_preview", true],
    sample_every_n_epochs: ["enable_preview", true],
    sample_prompts: ["enable_preview", true],
    huber_schedule: ["loss_type", ["huber", "smooth_l1"]],
    huber_c: ["loss_type", ["huber", "smooth_l1"]],
    v2: ["model_train_type", ["sd-lora", "sd-dreambooth"]],
    v_parameterization: ["model_train_type", ["sd-lora", "sdxl-lora", "sd-dreambooth", "sdxl-finetune"]],
    scale_v_pred_loss_like_noise_pred: ["v_parameterization", true],
    wandb_api_key: ["log_with", "wandb"],
  };
  const rule = rules[name];
  return rule ? { field: rule[0], value: rule[1] } : null;
}

function bindForm(groups) {
  const form = document.querySelector("#trainer-form");
  form.addEventListener("input", (event) => {
    updateEditedField(event.target);
    applyDependentValues();
    updateVisibility();
    updatePreview(groups);
  });
  form.addEventListener("change", (event) => {
    updateEditedField(event.target);
    applyDependentValues();
    updateVisibility();
    updatePreview(groups);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const config = readForm(groups);
    console.log("Form submitted with config:", config);
    try {
      setStatus("正在启动训练...");
      console.log("Sending request to /api/run");
      const result = await api("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      console.log("API response:", result);
      setStatus(result.message || "训练任务已提交", "success");
    } catch (error) {
      console.error("Error:", error);
      setStatus(error.message, "error");
    }
  });

  document.querySelector("#reset-form").addEventListener("click", () => renderTrainer(routeFor(location.pathname)));
  document.querySelector("#stop-training").addEventListener("click", stopTraining);
  document.querySelector("#export-config").addEventListener("click", () => downloadJson(readForm(groups)));
  document.querySelector("#export-toml").addEventListener("click", () => downloadToml(readForm(groups)));
  document.querySelector("#import-config").addEventListener("change", importConfig);
  document.querySelector("#import-toml").addEventListener("change", importToml);
  bindSectionCollapse(form);

  for (const button of document.querySelectorAll("[data-pick]")) {
    button.addEventListener("click", async () => {
      try {
        const data = await api(`/api/pick_file?picker_type=${encodeURIComponent(button.dataset.pickType)}`);
        const input = document.querySelector(`[name="${CSS.escape(button.dataset.pick)}"]`);
        input.value = data.path;
        updateEditedField(input);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  }
  applyDependentValues();
  updateVisibility();
  captureInitialFieldValues(groups);
}

function bindSectionCollapse(form) {
  form.addEventListener("click", (event) => {
    const button = event.target.closest("[data-collapse-section]");
    if (!button || !form.contains(button)) return;

    const key = button.dataset.collapseSection;
    const section = button.closest(".form-section");
    if (!key || !section) return;

    const collapsed = !state.collapsedSections.has(key);
    if (collapsed) state.collapsedSections.add(key);
    else state.collapsedSections.delete(key);

    section.classList.toggle("is-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    const icon = button.querySelector(".section-toggle-icon");
    if (icon) icon.textContent = collapsed ? "+" : "-";
  });
}

function captureInitialFieldValues(groups) {
  state.initialFieldValues = new Map();
  for (const group of groups) {
    for (const field of group.fields) {
      const input = document.querySelector(`[name="${CSS.escape(field.name)}"]`);
      if (input) state.initialFieldValues.set(field.name, fieldValue(input));
    }
  }
}

function updateEditedField(input) {
  if (!input?.name || !state.initialFieldValues.has(input.name)) return;
  const field = input.closest(".field");
  if (!field) return;
  field.classList.toggle("is-edited", fieldValue(input) !== state.initialFieldValues.get(input.name));
}

function updateEditedFields(groups) {
  for (const group of groups) {
    for (const field of group.fields) {
      const input = document.querySelector(`[name="${CSS.escape(field.name)}"]`);
      if (input) updateEditedField(input);
    }
  }
}

function fieldValue(input) {
  if (input.type === "checkbox") return String(input.checked);
  if (input.multiple) return Array.from(input.selectedOptions).map((option) => option.value).join("\n");
  return input.value;
}

function readForm(groups) {
  const values = {};
  for (const group of groups) {
    for (const field of group.fields) {
      const input = document.querySelector(`[name="${CSS.escape(field.name)}"]`);
      if (!input) continue;
      if (input.type === "checkbox") values[field.name] = input.checked;
      else if (input.multiple) values[field.name] = Array.from(input.selectedOptions).map((option) => option.value);
      else if (isResolutionField(field.name)) values[field.name] = normalizeResolutionForConfig(input.value);
      else values[field.name] = input.value;
    }
  }
  return cleanConfig(values, groups);
}

function updatePreview(groups) {
  const config = readForm(groups);
  document.querySelector("#generated-args").innerHTML = renderGeneratedArgs(config);
  document.querySelector("#preview").textContent = toToml(config);
}

function updateVisibility() {
  for (const field of document.querySelectorAll("[data-visible-field]")) {
    const controller = document.querySelector(`[name="${CSS.escape(field.dataset.visibleField)}"]`);
    if (!controller) {
      field.hidden = true;
      continue;
    }
    const current = controller.type === "checkbox" ? String(controller.checked) : controller.value;
    const visibleValues = JSON.parse(field.dataset.visibleValue);
    const isVisible = visibleValues.includes(current);
    field.hidden = !isVisible;
    field.classList.toggle("is-hidden", !isVisible);
    field.style.display = isVisible ? "" : "none";
  }
  for (const section of document.querySelectorAll(".form-section")) {
    const fields = Array.from(section.querySelectorAll(".field"));
    if (!fields.length) continue;
    const visibleFields = fields.filter((field) => field.style.display !== "none" && !field.hidden);
    section.style.display = visibleFields.length ? "" : "none";
  }
}

const optimizerRules = [
  {
    match: (optimizer) => optimizer.toLowerCase().startsWith("dadapt"),
    values: {
      learning_rate: 1,
      unet_lr: 1,
      text_encoder_lr: 1,
    },
    args: (config, optimizer) =>
      ["DAdaptation", "DAdaptAdam"].includes(optimizer) ? ["decouple=True", "weight_decay=0.01"] : [],
  },
  {
    match: (optimizer) => optimizer.toLowerCase() === "prodigy",
    args: (config) => [
      "decouple=True",
      "weight_decay=0.01",
      "use_bias_correction=True",
      config.prodigy_d_coef !== undefined ? `d_coef=${config.prodigy_d_coef}` : null,
      config.lr_warmup_steps ? "safeguard_warmup=True" : null,
      config.prodigy_d0 ? `d0=${config.prodigy_d0}` : null,
    ],
  },
  {
    match: (optimizer) => ["prodigyplus.ProdigyPlusScheduleFree", "ProdigyPlusScheduleFree"].includes(optimizer),
    values: {
      learning_rate: 1,
      unet_lr: 1,
      text_encoder_lr: 1,
      lr_scheduler: "constant",
    },
    args: (config) => [
      config.prodigyplus_d_coef !== undefined ? `d_coef=${config.prodigyplus_d_coef}` : null,
      config.prodigyplus_betas ? `betas=${config.prodigyplus_betas}` : null,
      config.prodigyplus_schedulefree_c !== undefined ? `schedulefree_c=${config.prodigyplus_schedulefree_c}` : null,
    ],
  },
];

function optimizerRuleFor(optimizer) {
  const value = String(optimizer ?? "");
  return optimizerRules.find((rule) => rule.match(value));
}

function applyOptimizerRuleToConfig(config) {
  const optimizer = String(config.optimizer_type ?? "");
  const rule = optimizerRuleFor(optimizer);
  if (!rule) return;

  for (const [name, value] of Object.entries(rule.values ?? {})) {
    config[name] = value;
  }
  config.optimizer_args.push(...(rule.args?.(config, optimizer) ?? []).filter(Boolean));
}

function applyDependentValues() {
  const optimizer = document.querySelector('[name="optimizer_type"]')?.value;
  const rule = optimizerRuleFor(optimizer);
  if (!rule) return;

  for (const [name, value] of Object.entries(rule.values ?? {})) {
    setFieldValue(name, String(value));
  }
}

function setFieldValue(name, value) {
  const input = document.querySelector(`[name="${CSS.escape(name)}"]`);
  if (!input || input.value === value) return;
  input.value = value;
}

function renderGeneratedArgs(config) {
  const sections = [];
  if (config.optimizer_args?.length) sections.push(["optimizer_args", config.optimizer_args]);
  if (config.network_args?.length) sections.push(["network_args", config.network_args]);
  if (!sections.length) return "";
  return sections
    .map(([name, args]) => `
      <div class="args-section">
        <div class="args-name">${escapeHtml(name)}:</div>
        ${args.map((arg) => `<div class="args-value">${escapeHtml(arg)}</div>`).join("")}
      </div>
    `)
    .join("");
}

function downloadJson(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${config.output_name || "training-config"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadToml(config) {
  const blob = new Blob([toToml(config)], { type: "application/toml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${config.output_name || "training-config"}.toml`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importConfig(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const config = JSON.parse(await file.text());
  applyImportedConfig(config);
  event.target.value = "";
}

async function importToml(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const config = fromToml(await file.text());
    validateImportedTomlForRoute(config);
    applyImportedConfig(config);
    setStatus("TOML 导入成功", "success");
  } catch (error) {
    setStatus(`TOML 导入失败：${error.message}`, "error");
  }
  event.target.value = "";
}

function validateImportedTomlForRoute(config) {
  const importedType = config.model_train_type;
  if (!importedType) return;

  const allowedTypes = allowedModelTrainTypesForCurrentRoute();
  if (!allowedTypes.length || allowedTypes.includes(importedType)) return;

  throw new Error(`当前页面只支持 ${allowedTypes.join(" / ")}，导入文件是 ${importedType}`);
}

function allowedModelTrainTypesForCurrentRoute() {
  const route = state.currentRoute ?? routeFor(location.pathname);
  const groups = state.fields ?? [];
  const field = groups.flatMap((group) => group.fields).find((item) => item.name === "model_train_type");
  const schemaTypes = field ? schemaOptions(field.schema) ?? [] : [];
  const defaultType = route.defaults?.model_train_type;
  if (defaultType) return [defaultType];
  if (schemaTypes.length) return schemaTypes;
  const currentType = state.current?.model_train_type;
  return currentType ? [currentType] : [];
}

function applyImportedConfig(config) {
  const normalizedConfig = expandImportedNetworkArgs(config);
  for (const [name, value] of Object.entries(normalizedConfig)) {
    const input = document.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!input) continue;
    if (input.type === "checkbox") input.checked = Boolean(value);
    else if (isResolutionField(name)) input.value = formatResolutionForInput(value);
    else input.value = Array.isArray(value) ? value.join("\n") : value;
  }
  applyDependentValues();
  updateVisibility();
  updateEditedFields(state.fields);
  updatePreview(state.fields);
}

function expandImportedNetworkArgs(config) {
  const result = { ...config };
  if (!Array.isArray(config.network_args)) return result;

  const customArgs = [];
  for (const arg of config.network_args) {
    const text = String(arg);
    const separator = text.indexOf("=");
    const name = separator >= 0 ? text.slice(0, separator) : text;
    if (["network_reg_dims", "network_reg_lrs"].includes(name)) {
      result[name] = separator >= 0 ? text.slice(separator + 1) : "";
    } else {
      customArgs.push(text);
    }
  }
  if (customArgs.length) result.network_args_custom = customArgs;
  return result;
}

function toToml(config) {
  return `${Object.entries(config)
    .map(([key, value]) => `${key} = ${tomlValue(value)}`)
    .join("\n")}\n`;
}

function tomlValue(value) {
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return JSON.stringify(String(value));
}

function fromToml(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line || line.startsWith("[[")) continue;
    if (line.startsWith("[")) throw new Error("当前导入器只支持训练配置使用的扁平 TOML");
    const separator = findTomlSeparator(line);
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    result[key] = parseTomlValue(value);
  }
  return result;
}

function stripTomlComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? null : quote || char;
    }
    if (char === "#" && !quote) return line.slice(0, index);
  }
  return line;
}

function findTomlSeparator(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? null : quote || char;
    }
    if (char === "=" && !quote) return index;
  }
  return -1;
}

function parseTomlValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) return parseTomlArray(value.slice(1, -1));
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return parseTomlString(value);
  }
  return value;
}

function parseTomlArray(source) {
  const values = [];
  let quote = null;
  let current = "";
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if ((char === '"' || char === "'") && source[index - 1] !== "\\") quote = quote === char ? null : quote || char;
    if (!quote && char === "[") depth += 1;
    if (!quote && char === "]") depth -= 1;
    if (char === "," && !quote && depth === 0) {
      if (current.trim()) values.push(parseTomlValue(current.trim()));
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) values.push(parseTomlValue(current.trim()));
  return values;
}

function parseTomlString(value) {
  if (value.startsWith("'")) return value.slice(1, -1);
  try {
    return JSON.parse(value);
  } catch {
    return value.slice(1, -1);
  }
}

async function renderTasks() {
  const data = await api("/api/tasks");
  const tasks = data.tasks ?? [];
  content().innerHTML = `
    <section class="panel">
      <h2>任务列表</h2>
      ${tasks.length ? tasks.map(renderTask).join("") : "<p>没有正在记录的任务。</p>"}
    </section>
  `;
  for (const button of document.querySelectorAll("[data-terminate]")) {
    button.addEventListener("click", async () => {
      await api(`/api/tasks/terminate/${encodeURIComponent(button.dataset.terminate)}`);
      renderTasks();
    });
  }
}

async function stopTraining() {
  try {
    const data = await api("/api/tasks");
    const runningTasks = (data.tasks ?? []).filter((task) => task.status === "RUNNING");
    if (!runningTasks.length) {
      setStatus("当前没有正在运行的训练任务", "warning");
      return;
    }

    const task = runningTasks[0];
    if (!confirm(`确定要停止任务 ${task.id} 吗？`)) return;

    await api(`/api/tasks/terminate/${encodeURIComponent(task.id)}`);
    setStatus(`已停止任务 ${task.id}`, "success");
  } catch (error) {
    setStatus(`停止训练失败：${error.message}`, "error");
  }
}

function renderTask(task) {
  const id = task.id ?? task.task_id ?? task.name ?? "";
  return `
    <article class="task-row">
      <div><strong>${escapeHtml(id || "task")}</strong><p>${escapeHtml(task.status ?? "")}</p></div>
      ${id ? `<button type="button" data-terminate="${escapeAttr(id)}">终止</button>` : ""}
    </article>
  `;
}

function renderProxy(route) {
  if (route.service && state.runtime?.services?.[route.service] === false) {
    renderServiceUnavailable(route);
    return;
  }
  content().innerHTML = `<iframe class="proxy-frame" src="${escapeAttr(route.proxy)}" title="${escapeAttr(route.title)}"></iframe>`;
}

function renderServiceUnavailable(route) {
  const command = route.service === "tensorboard" ? "--enable-tensorboard" : "--enable-tageditor";
  content().innerHTML = `
    <section class="panel service-unavailable">
      <h2>${escapeHtml(route.title)} 未启动</h2>
      <p>当前 UI 启动时没有启用这个服务，因此不会连接 ${escapeHtml(route.proxy)}。</p>
      <p>需要使用时，请用 <code>${escapeHtml(command)}</code> 重新启动 GUI。</p>
    </section>
  `;
}

function renderTagger() {
  content().innerHTML = `
    <section class="panel service-unavailable">
      <h2>Tagger 尚未接入源码前端</h2>
      <p>Tagger 后端接口已经存在，但这个轻量源码前端还没有迁移对应页面。</p>
      <p>需要批量标注时，请先使用 Tag Editor，启动 GUI 时加上 <code>--enable-tageditor</code>。</p>
    </section>
  `;
}

function renderSettings() {
  content().innerHTML = `
    <section class="panel">
      <h2>设置</h2>
      <p>设置页源码迁移待补充。</p>
    </section>
  `;
}

async function render() {
  const route = routeFor(location.pathname);
  if (!state.runtime) await loadRuntime();
  renderShell(route);
  if (!state.schemas.size) await loadSchemas();

  if (route.view === "home") renderHome();
  else if (route.view === "trainer") renderTrainer(route);
  else if (route.view === "tasks") await renderTasks();
  else if (route.view === "proxy") renderProxy(route);
  else if (route.view === "tagger") renderTagger();
  else if (route.view === "settings") renderSettings();
  else renderInfo(route);
}

function content() {
  return document.querySelector("#content");
}

function setStatus(message, type = "info") {
  state.message = message;
  const status = document.querySelector("#status");
  if (status) status.textContent = message;
  showToast(message, type);
}

function showToast(message, type = "info") {
  const root = toastRoot();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `
    <div class="toast-body">${escapeHtml(message)}</div>
    <button type="button" class="toast-close" aria-label="Close notification">x</button>
  `;
  root.appendChild(toast);

  const close = () => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 180);
  };
  toast.querySelector(".toast-close").addEventListener("click", close);
  setTimeout(close, type === "error" ? 11000 : 7200);
}

function toastRoot() {
  let root = document.querySelector("#toast-root");
  if (root) return root;
  root = document.createElement("div");
  root.id = "toast-root";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "false");
  document.body.appendChild(root);
  return root;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

window.addEventListener("popstate", render);
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || link.origin !== location.origin) return;
  event.preventDefault();
  history.pushState(null, "", link.href);
  render();
});

render().catch((error) => {
  app.innerHTML = `<main class="fatal"><h1>Frontend error</h1><pre>${escapeHtml(error.stack || error.message)}</pre></main>`;
});
