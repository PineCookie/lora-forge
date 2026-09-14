Schema.intersect([
    Schema.object({
        model_train_type: Schema.string().default("anima-lora").disabled().description("训练种类"),
        pretrained_model_name_or_path: Schema.string().role('filepicker', { type: "model-file" }).default("./sd-models/anima.safetensors").description("Anima DiT 模型路径"),
        qwen3: Schema.string().role('filepicker', { type: "model-file" }).description("必填。Qwen3-0.6B 模型路径，可填写 safetensors 文件或模型目录"),
        vae: Schema.string().role('filepicker', { type: "model-file" }).description("必填。Qwen-Image VAE 模型路径"),
        llm_adapter_path: Schema.string().role('filepicker', { type: "model-file" }).description("可选：单独的 LLM adapter 权重路径。不填写时从 DiT 中读取"),
        t5_tokenizer_path: Schema.string().role('filepicker', { type: "folder" }).description("可选：T5 tokenizer 目录。不填写时使用 sd-scripts 内置 configs/t5_old"),
        resume: Schema.string().role('filepicker', { type: "folder" }).description("从某个 `save_state` 保存的中断状态继续训练，填写文件路径"),
    }).description("训练用模型"),

    Schema.object({
        train_data_dir: SHARED_SCHEMAS.RAW.DATASET_SETTINGS.train_data_dir,
        output_name: SHARED_SCHEMAS.RAW.SAVE_FIELDS.output_name,
        output_dir: SHARED_SCHEMAS.RAW.SAVE_FIELDS.output_dir,
        logging_dir: SHARED_SCHEMAS.RAW.LOG_FIELDS.logging_dir,
    }).description("⚡ 快速配置"),

    Schema.object({
        timestep_sampling: Schema.union(["sigma", "uniform", "sigmoid", "shift", "flux_shift"]).default("sigmoid").description("时间步采样"),
        show_timesteps: Schema.union(["console", "image"]).description("预览时间步分布的格式。请使用“预览时间步分布”按钮；“开始训练”会忽略该预览设置。⚠ 需 sd-scripts v0.11.1+"),
        show_timesteps_resolution: Schema.string().default("1024").description("预览用假定图像分辨率（H 或 H,W）。flux_shift 模式会使用此值"),
        show_timesteps_offset: Schema.number().step(0.01).default(0.0).description("时间步预览偏移。只影响 show_timesteps 预览，sigma/uniform 采样时无效。⚠ 需 sd-scripts main（> v0.11.1）"),
        weighting_scheme: Schema.union(["sigma_sqrt", "logit_normal", "mode", "cosmap", "none", "uniform"]).default("uniform").description("时间步损失权重方案"),
        sigmoid_scale: Schema.number().step(0.001).default(1.0).description("sigmoid 缩放"),
        discrete_flow_shift: Schema.number().step(0.001).default(1.0).description("离散流位移"),
        qwen3_max_token_length: Schema.number().step(1).default(512).description("Qwen3 最大 token 长度"),
        t5_max_token_length: Schema.number().step(1).default(512).description("T5 tokenizer 最大 token 长度"),
        llm_adapter_lr: Schema.number().step(0.000001).default(0).description("LLM adapter 学习率。官方建议 LoRA 微调时冻结，填写 0 时冻结"),
        self_attn_lr: Schema.number().step(0.000001).description("Self Attention 分层学习率。不填写时使用总学习率，填写 0 时冻结"),
        cross_attn_lr: Schema.number().step(0.000001).description("Cross Attention 分层学习率。不填写时使用总学习率，填写 0 时冻结"),
        mlp_lr: Schema.number().step(0.000001).description("MLP 分层学习率。不填写时使用总学习率，填写 0 时冻结"),
        mod_lr: Schema.number().step(0.000001).description("AdaLN modulation 分层学习率。不填写时使用总学习率，填写 0 时冻结"),
    }).description("Anima 专用参数"),

    Schema.object(
        UpdateSchema(SHARED_SCHEMAS.RAW.DATASET_SETTINGS, {
            resolution: Schema.string().default("1024,1024").description("训练图片分辨率，宽x高。Anima 支持 512x512 到 1536x1536，必须是 16 倍数。"),
            enable_bucket: Schema.boolean().default(true).description("启用 arb 桶以允许非固定宽高比的图片"),
            min_bucket_reso: Schema.number().default(512).description("arb 桶最小分辨率"),
            max_bucket_reso: Schema.number().default(2048).description("arb 桶最大边长。Anima 方图建议不超过 1536；如需 2:1 等宽屏图，可提高到 2048 或更高，但显存占用按总像素增长"),
            bucket_reso_steps: Schema.number().default(16).description("arb 桶分辨率划分单位。Anima 推荐 16"),
        }, ["train_data_dir"])
    ).description("数据集设置"),

    // 保存设置（output_name / output_dir 已移至 ⚡ 快速配置）
    Schema.intersect([
        Schema.object(UpdateSchema(SHARED_SCHEMAS.RAW.SAVE_FIELDS, {}, ["output_name", "output_dir"])).description("保存设置"),
        Schema.union([
            Schema.object({
                save_state: Schema.const(true).required(),
                save_last_n_epochs_state: Schema.number().min(1).description("仅保存最后 n epoch 的训练状态"),
            }),
            Schema.object({})
        ])
    ]),

    Schema.object({
        max_train_epochs: Schema.number().min(1).default(10).description("最大训练 epoch（轮数）"),
        train_batch_size: Schema.number().min(1).default(1).description("批量大小，越高显存占用越高"),
        gradient_checkpointing: Schema.boolean().default(true).description("梯度检查点"),
        gradient_accumulation_steps: Schema.number().min(1).default(1).description("梯度累加步数"),
        network_train_unet_only: Schema.boolean().default(true).description("仅训练 DiT/Unet。启用文本编码器缓存时必须开启"),
        network_train_text_encoder_only: Schema.boolean().default(false).description("仅训练文本编码器"),
    }).description("训练相关参数"),

    // 学习率&优化器设置
    SHARED_SCHEMAS.LR_OPTIMIZER,

    // 损失设置
    SHARED_SCHEMAS.LOSS_SETTINGS_NO_WEIGHTING,

    Schema.intersect([
        Schema.object({
            network_module: Schema.union(["networks.lora_anima"]).default("networks.lora_anima").description("训练网络模块"),
            network_weights: Schema.string().role('filepicker').description("从已有的 Anima LoRA 模型上继续训练，填写路径"),
            network_dim: Schema.number().min(1).default(32).description("网络维度，官方 LoRA 微调建议可从 rank 32 开始"),
            network_alpha: Schema.number().min(1).default(32).description("常用值：等于 network_dim 或 network_dim/2 或 1。使用较小的 alpha 需要提升学习率"),
            network_dropout: Schema.number().step(0.01).default(0).description("dropout 概率"),
            scale_weight_norms: Schema.number().step(0.01).min(0).description("最大范数正则化。如果使用，推荐为 1"),
            network_args_custom: Schema.array(String).role('table').description("自定义 network_args，一行一个。例如：train_llm_adapter=true"),
            enable_base_weight: Schema.boolean().default(false).description("启用基础权重（差异炼丹）"),
        }).description("网络设置"),

        SHARED_SCHEMAS.NETWORK_OPTION_BASEWEIGHT,
    ]),

    // 预览图设置
    Schema.intersect([
        Schema.object({
            enable_preview: Schema.boolean().default(false).description("启用训练预览图"),
        }).description("训练预览图设置"),

        Schema.union([
            Schema.object({
                enable_preview: Schema.const(true).required(),
                randomly_choice_prompt: Schema.boolean().default(false).description("随机选择预览图 Prompt"),
                prompt_file: Schema.string().role('textarea').description("预览图 Prompt 文件路径。填写后将采用文件内的 prompt，而下方的选项将失效。"),
                positive_prompts: Schema.string().role('textarea').default("masterpiece, best quality, score_7, safe, 1girl, solo").description("Prompt"),
                negative_prompts: Schema.string().role('textarea').default("worst quality, low quality, score_1, score_2, score_3, artist name").description("Negative Prompt"),
                sample_width: Schema.number().default(1024).description("预览图宽"),
                sample_height: Schema.number().default(1024).description("预览图高"),
                sample_cfg: Schema.number().min(1).max(30).default(4.5).description("CFG Scale，Anima 推荐 4-5"),
                sample_seed: Schema.number().default(2333).description("种子"),
                sample_steps: Schema.number().min(1).max(300).default(40).description("迭代步数，Anima 推荐 30-50"),
                sample_sampler: Schema.union(["ddim", "pndm", "lms", "euler", "euler_a", "heun", "dpm_2", "dpm_2_a", "dpmsolver", "dpmsolver++", "dpmsingle", "k_lms", "k_euler", "k_euler_a", "k_dpm_2", "k_dpm_2_a"]).default("euler_a").description("生成预览图所用采样器"),
                sample_every_n_epochs: Schema.number().default(2).description("每 N 个 epoch 生成一次预览图"),
            }),
            Schema.object({}),
        ]),
    ]),

    // 日志设置（logging_dir 已移至 ⚡ 快速配置）
    Schema.intersect([
        Schema.object(UpdateSchema(SHARED_SCHEMAS.RAW.LOG_FIELDS, {}, ["logging_dir"])).description("日志设置"),
        Schema.union([
            Schema.object({
                log_with: Schema.const("wandb").required(),
                wandb_api_key: Schema.string().required().description("wandb 的 api 密钥"),
            }),
            Schema.object({}),
        ]),
    ]),

    // caption 选项
    // caption 选项。weighted_captions 在 Anima 训练中不被支持（strategy_anima 未实现加权分词，
    // 开启后要么静默忽略、要么在未启用文本编码器缓存时直接报 NotImplementedError），因此隐藏该字段。
    Schema.object(UpdateSchema(SHARED_SCHEMAS.RAW.CAPTION_SETTINGS, {}, ["max_token_length", "weighted_captions"])).description("caption（Tag）选项"),

    // 噪声设置
    SHARED_SCHEMAS.NOISE_SETTINGS,

    // 数据增强
    SHARED_SCHEMAS.DATA_ENCHANCEMENT,

    // 其他选项。Anima 不使用 clip_skip/v2/v_parameterization，因此这里不复用 SHARED_SCHEMAS.OTHER。
    Schema.object({
        seed: Schema.number().default(1337).description("随机种子"),
        ui_custom_params: Schema.string().role('textarea').description("**危险** 自定义参数，请输入 TOML 格式，将会直接覆盖当前界面内任何参数。实时更新，推荐写完后再粘贴过来"),
    }).description("其他设置"),

    // 速度优化选项
    Schema.object(
        UpdateSchema(SHARED_SCHEMAS.RAW.PRECISION_CACHE_BATCH, {
            mixed_precision: Schema.union(["no", "fp16", "bf16"]).default("bf16").description("训练混合精度，RTX30系列以后也可以指定 `bf16`。选择完全精度模式时会自动调整"),
            full_precision: Schema.union(["none", "full_fp16", "full_bf16"]).default("full_bf16").description("完全精度模式。选择 full_fp16/full_bf16 会自动把混合精度设为 fp16/bf16（sd-scripts 强制要求一致）"),
            cache_text_encoder_outputs: Schema.boolean().default(true).description("缓存文本编码器的输出，减少显存使用。使用时需要关闭 shuffle_caption，并会自动开启 network_train_unet_only（启用缓存后无法训练文本编码器）"),
            cache_text_encoder_outputs_to_disk: Schema.boolean().default(true).description("缓存文本编码器的输出到磁盘"),
            cache_latents: Schema.boolean().default(true).description("缓存图像 latent，缓存 VAE 输出以减少 VRAM 使用"),
            cache_latents_to_disk: Schema.boolean().default(true).description("缓存图像 latent 到磁盘"),
            // Anima 不使用 --xformers / --sdpa：anima_train_network.py 会用 --attn_mode 覆盖它们，
            // 因此这里只暴露 attn_mode，避免出现“勾了却没生效”的开关。
            attn_mode: Schema.union(["torch", "xformers", "flash"]).default("torch").description("Attention 实现。torch = PyTorch SDPA（默认）；xformers 需 xformers，flash 需 flash-attn"),
            split_attn: Schema.boolean().default(false).description("逐样本拆分 attention 计算以降低显存。Anima 无 attention mask，xformers 并非必须；不能与 compile_fullgraph 同时启用"),
            blocks_to_swap: Schema.number().min(0).step(1).description("训练时交换到 CPU 的 block 数量。不能与 cpu/unsloth offload checkpointing 同时使用（勾选任一 offload 会自动清空此项）"),
            cpu_offload_checkpointing: Schema.boolean().default(false).description("将梯度检查点 offload 到 CPU，降低显存但会变慢。与 blocks_to_swap、unsloth offload 互斥"),
            unsloth_offload_checkpointing: Schema.boolean().default(false).description("使用异步 CPU RAM offload 激活值。与 cpu_offload_checkpointing、blocks_to_swap 互斥"),
            vae_chunk_size: Schema.number().min(2).step(2).description("VAE 编解码空间分块大小，必须为偶数。不填写则不分块。启用 qwen_image_vae_2d 时对峰值显存影响很小"),
            vae_disable_cache: Schema.boolean().default(false).description("禁用 VAE 内部缓存以降低显存。qwen_image_vae_2d 无时间维缓存，该选项无效"),
            qwen_image_vae_2d: Schema.boolean().default(false).description("使用仅图像 2D Qwen-Image VAE（将 Conv3d 权重转为 Conv2d），encode/decode 约 2 倍速、峰值显存约 1/3，推荐配合 cache_latents 使用。⚠ 需 sd-scripts v0.11.1+"),
            text_encoder_batch_size: Schema.number().min(1).description("缓存文本编码器输出时的批量大小，不填写则使用数据集 batch size"),
        }, ["fp8_base", "fp8_base_unet", "no_half_vae", "lowram", "full_fp16", "full_bf16", "xformers", "sdpa"])
    ).description("速度优化选项"),

    // torch.compile 优化（Anima per-block compile，v0.11.1+）
    Schema.object({
        compile: Schema.boolean().default(false).description("启用 per-block torch.compile，显著加速 Anima 训练（需 Triton）。与旧版 --torch_compile 互斥；下方的 backend/mode/dynamic/fullgraph/cache_size_limit 仅在开启时生效"),
        compile_backend: Schema.union(["inductor", "eager", "aot_eager"]).default("inductor").description("torch.compile 后端"),
        compile_mode: Schema.union(["default", "reduce-overhead", "max-autotune", "max-autotune-no-cudagraphs"]).default("default").description("编译模式。max-autotune 最快但首次编译慢"),
        compile_dynamic: Schema.union(["auto", "true", "false"]).default("auto").description("动态形状模式。Windows 上选 true 需要 VS 2022 C++ 编译器"),
        compile_fullgraph: Schema.boolean().default(false).description("全图编译模式。不能与 split_attn 同时使用（勾选后会自动取消 split_attn）"),
        compile_cache_size_limit: Schema.number().min(1).default(32).description("torch._dynamo 缓存大小限制，推荐 32"),
        cuda_allow_tf32: Schema.boolean().default(false).description("允许 TF32 精度（Ampere+ GPU），可提升性能。与 compile 无关，可单独启用"),
        cuda_cudnn_benchmark: Schema.boolean().default(false).description("启用 cuDNN benchmark 模式，可能提升性能。与 compile 无关，可单独启用"),
    }).description("torch.compile / CUDA 性能优化（⚠ 需 sd-scripts v0.11.1+）"),

    // 分布式训练
    SHARED_SCHEMAS.DISTRIBUTED_TRAINING
]);
