/** Minimal typing for the parts of mapshaper's Node API used by build-data.ts. */
declare module 'mapshaper' {
  const mapshaper: {
    /** Runs a mapshaper command string, reading and writing files. */
    runCommands(commands: string): Promise<void>;
  };
  export default mapshaper;
}
