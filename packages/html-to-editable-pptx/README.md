# HTML to Editable PPTX

This optional package adds a constrained HTML-to-native-PPTX path to Frontend
Slides. It measures annotated DOM elements in a fixed slide stage, writes a
stable JSON element model, and routes that model to native PowerPoint objects.

The forward path uses browser measurements plus PPTXGenJS. The reverse path
uses `python-pptx` and recovers stable IDs written into PPTX shape metadata, so
a human-edited deck can become a new HTML editing surface.

It intentionally supports a small, predictable CSS subset first. Unsupported
visuals should use the screenshot fallback instead of being silently distorted.

Editable text keeps its authored size. Export uses normal or 1.5x paragraph
line spacing and disables PowerPoint shrink-to-fit, which can otherwise resize
text again after manual edits.
