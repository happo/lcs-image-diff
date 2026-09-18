// `imagetracerjs` ships no types of its own. This covers the one entry point
// `DiffTrace` uses.
declare module 'imagetracerjs' {
  interface ImageDataLike {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }

  interface TracingOptions {
    numberofcolors?: number;
    colorsampling?: number;
    qtres?: number;
    ltres?: number;
    roundcoords?: number;
    viewbox?: boolean;
    pathomit?: number;
    strokewidth?: number;
  }

  const imagetracer: {
    imagedataToSVG(imgd: ImageDataLike, options?: TracingOptions): string;
  };

  export default imagetracer;
}
