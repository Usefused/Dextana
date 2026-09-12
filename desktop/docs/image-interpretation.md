# Image interpreter

In **Settings → Models**, connect your provider and choose an **Image interpreter** alongside the embedding model. It uses the same provider URL and saved connection credentials. Ollama models are listed by their reported vision capability; compatible providers are listed by reported image-input metadata. A manual model ID is available for providers with incomplete catalogs.

The default, **Use the selected chat model**, preserves direct image delivery. Selecting an interpreter sends approved images and screenshots to that model first, then gives its observations to the chat model. This lets text-only chat models work with images. A description can omit visual details, so direct delivery remains useful when the chat model already supports vision.

File and browser permissions still apply before image content reaches either model. The interpreter has no tools and receives only the image, nearby image context, and the latest text question. Its final observations exclude thinking content. Failures report a settings error rather than silently sending the image to a different model.

Interpretation adds a model request. Observations are cached in memory for the same activity, connection, image and question to avoid repeated calls during a tool loop. Original transcript image data remains intact. Switching providers or URLs clears the draft interpreter selection; saving persists the chosen model. Ollama vision support is checked on save; compatible providers with incomplete metadata are checked by the actual image request.
