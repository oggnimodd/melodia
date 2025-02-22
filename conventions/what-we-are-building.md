# What we are building

So melodia is a web application when users can upload their midi files and play and visualize them in the website using piano like ui. Is's very similar to synthesia, but on the web. We will add a bunch of controls like bpm control, instruments, grid, note keys, colors, loop, transposing, delay before playing, etc.

## But first

First we need to figure out how to parse a MIDI file into ideally a JSON object. I don't know if there is any libraries out there that can do this process. Basically, I think, well, there is one library that I think have this capability which is tone JSON. Tone.js, I think we can use that, but I'm not sure. And after that, we need to figure out how to play the MIDI using a virtual instrument on the web. I'm not sure how to do that. And lastly, we need to build our UI for the best performance. We are going to build for the best performance, we are going to build For the best performance we are going to use Canvas for rendering all of this crazy animation and piano playing simulation UI.
