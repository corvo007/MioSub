declare module 'assjs' {
  export interface ASSOption {
    /**
     * The container to display subtitles.
     * Its style should be set with `position: relative` for subtitles will absolute to it.
     * Defaults to `video.parentNode`
     */
    container?: HTMLElement;

    /**
     * When script resolution(PlayResX and PlayResY) don't match the video resolution, this API defines how it behaves.
     * However, drawings and clips will be always depending on script origin resolution.
     * There are four valid values, we suppose video resolution is 1280x720 and script resolution is 640x480 in following situations:
     * + `video_width`: Script resolution will set to video resolution based on video width. Script resolution will set to 640x360, and scale = 1280 / 640 = 2.
     * + `video_height`(__default__): Script resolution will set to video resolution based on video height. Script resolution will set to 853.33x480, and scale = 720 / 480 = 1.5.
     * + `script_width`: Script resolution will not change but scale is based on script width. So scale = 1280 / 640 = 2. This may causes top and bottom subs disappear from video area.
     * + `script_height`: Script resolution will not change but scale is based on script height. So scale = 720 / 480 = 1.5. Script area will be centered in video area.
     */
    resampling?: 'video_width' | 'video_height' | 'script_width' | 'script_height';
  }

  export default class ASS {
    /**
     * Initialize an ASS instance
     * @param content ASS content
     * @param video The video element to be associated with
     * @param option
     */
    constructor(content: string, video: HTMLVideoElement, option?: ASSOption);

    /**
     * Desctroy the ASS instance
     */
    destroy(): ASS;

    /**
     * Recalculate and apply subtitle positioning and scaling.
     */
    resize(): void;

    /**
     * Show subtitles in the container
     */
    show(): ASS;

    /**
     * Hide subtitles in the container
     */
    hide(): ASS;

    /** @type {number} Subtitle delay in seconds. */
    delay: number;

    /** @type {ASSOption['resampling']} */
    resampling: string;
  }
}
