import type {CoreEvent} from './protocol';
type Metric = Extract<CoreEvent,{type:'metrics'}>;
export class PerformanceMeter {
  private previous?: {time:number;frame:number;ticks:bigint};
  sample(time:number,frame:number,ticks:bigint,ticksPerSecond:number):Metric|null {
    const previous=this.previous;
    if (!previous || ticks < previous.ticks) {this.previous={time,frame,ticks};return null;}
    const elapsed=(time-previous.time)/1000;
    if (elapsed<1 || !Number.isFinite(elapsed) || ticksPerSecond<=0) return null;
    this.previous={time,frame,ticks};
    return {type:'metrics',fps:((frame-previous.frame)>>>0)/elapsed,emulationSpeed:Number(ticks-previous.ticks)/ticksPerSecond/elapsed};
  }
}
