We can generate good sprite sheets of 4 or even 8 way sprite animations using the following pipeline.

Image Gen => Video Gen => Slice Video To Frames => Editor pipeline to coerce fames into smooth sprite flipbook.

Goal is can generate any character + animation and come out with specialized flipbook.

Could all be done locally too.

Image Gen = ??? (FLUX.2 [dev] or https://huggingface.co/stabilityai/stable-diffusion-3.5-large or qwen-image)
Video Gen = MiniMax H3
Editor Pipeline = ???
- https://github.com/joepUI/framekit-web
- https://github.com/MathisVerstrepen/spritely
