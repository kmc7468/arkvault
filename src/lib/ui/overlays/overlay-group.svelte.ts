// Manages overlays (modals and bottom sheets) of which at most one is open at a time
export class OverlayGroup<T extends string> {
  current: T | undefined = $state();

  open(name: T) {
    this.current = name;
  }

  close() {
    this.current = undefined;
  }

  // Getter and setter for `bind:isOpen={getter, setter}`
  getter(name: T) {
    return () => this.current === name;
  }

  setter(name: T) {
    return (isOpen: boolean) => {
      if (isOpen) {
        this.current = name;
      } else if (this.current === name) {
        this.current = undefined;
      }
    };
  }
}
