# Bundled Whisper (local speech-to-text)

`whisper-cli.exe` and its four DLLs (`ggml.dll`, `ggml-base.dll`,
`ggml-cpu.dll`, `whisper.dll`) are the official prebuilt Windows x64 CPU
release from [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp)
(MIT license — see `LICENSE-whisper.cpp.txt`). They're small (~1.9MB
total) and committed to the repo directly.

The model file (`models/ggml-base.bin`, ~142MB) is **not** committed —
it's fetched by `BUILD.bat` right before packaging, from whisper.cpp's
own model host on Hugging Face. This keeps the repo itself small while
still shipping a fully working, offline transcription backend in the
built installer — nothing is downloaded by the *person using the app*,
only once, by whoever runs the build.

If you're building manually without `BUILD.bat`, fetch it yourself:

```
curl -L -o resources/whisper/models/ggml-base.bin ^
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

electron-builder's `extraResources` config (package.json) copies this
whole folder into the packaged app at `resources/whisper/`, which is
exactly where `foundation/ai/whisper.js`'s `candidatePaths()` looks for
it — no configuration needed after a build.
