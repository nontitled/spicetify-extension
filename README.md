# nontitled
Fork of Spicy Lyrics with a Source Manager already set up with the nontitled source.

# How to install nontitled

> ## 1. Using the Spicetify Marketplace (recommended) (pending marketplace approval)
> 1. Search `nontitled` under the "Extensions" tab
> 2. Click the Install button on the nontitled extension
> 3. All done!

## 2. Externally (not recommended, currently the only available method)
1. Make sure you have [Spicetify](https://spicetify.app) installed
2. Download the [latest release](https://github.com/nontitled/spicetify-extension/releases/latest) file
3. Put the file inside the Spicetify Extensions directory. Find the correct directory here: [https://spicetify.app/docs/customization/extensions#manual-installation](https://spicetify.app/docs/customization/extensions#manual-installation)
4. Then, run ```spicetify config extensions nontitled.js```
5. Then apply Spicetify by running ```spicetify apply```
6. All done!

[![Github Version](https://img.shields.io/github/v/release/nontitled/spicetify-extension)](https://github.com/nontitled/spicetify-extension/) [![Github Stars badge](https://img.shields.io/github/stars/nontitled/spicetify-extension?style=social)](https://github.com/nontitled/spicetify-extension/) [![Discord Badge](https://dcbadge.limes.pink/api/server/Z8ug4snq9b?style=flat)](https://discord.gg/Z8ug4snq9b)

# How to create a Source
1. You can use any method you want as the extension supports all HTTP methods (ex. GET, POST...)
2. The response must be JSON-formatted.
3. The response should contain the information in this format:
```
{
  "name": "My source",
  "description": "With over 500 word-synced songs, my source is actually the best one ever created by a single person.",
  "lyrics": [ # For every song, an object
    {
      "spotifyURIs": [ # Can be one or more
        "spotify:track:abcdef123456",
        "spotify:track:ghijkm789012"
      ],
      "ttml": "<tt xmlns=..." # The actual raw TTML file.
    }
}
```
4. That's it.

# Original description
>Hi, I'm Spikerko (the person who made this repo). I've been really passionate about this project, and I'm really happy for this project
> 
>I've seen a problem with the Spotify Lyrics. They're plain, just static colors. So I wanted to build my own version. And here it is: **nontitled**. Hope you like it!
>
> ![Extension Example](./previews/page.gif)
> 
> 
> *Forked by [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics)*
> *Inspired by [Beautiful Lyrics](https://github.com/surfbryce/beautiful-lyrics)*
