interface Promises<T> {
    [seq: number]: {
        promise: Promise<T>;
        resolve?: (value: T) => void;
        reject?: (err: any) => void,
        createdAt: number,
    }
}

export class PromisePool<T> {

    private promises: Promises<T> = {};

    constructor() {
        this.prepareDefault();
        setInterval(() => {
            this.cleanup()
        }, 60 * 1000);
    }

    public prepare(seq: number): Promise<T> {
        this.promises[seq] = { createAt: Date.now() } as any;
        let promise = new Promise<T>((res, rej) => {
            let obj = this.promises[seq];
            obj.resolve = res;
            obj.reject = rej
        });
        this.promises[seq].promise = promise;
        return promise;
    }

    public prepareDefault(): Promise<T> {
        return this.prepare(Number.MAX_SAFE_INTEGER);
    }

    private get defaultPromise() {
        return this.promises[Number.MAX_SAFE_INTEGER];
    }

    public resolve(seq: number, value: T): void {
        let p = this.promises[seq];
        if (p && p.resolve) {
            p.resolve(value);
        } else {
            console.warn(`no such seq '${seq}'. using default, value: `, value);
            this.defaultPromise.resolve && this.defaultPromise.resolve(value);
        }
    }

    public reject(seq: number, err: any): void {
        let p = this.promises[seq];
        if (p && p.reject) {
            p.reject(err);
        } else {
            console.warn(`no such seq '${seq}'.`)
            this.defaultPromise.reject && this.defaultPromise.reject(err);
        }
    }

    private cleanup(): void {
        let now = Date.now();
        Object.keys(this.promises).forEach((key: string) => {
            let seq = parseInt(key);
            if (this.promises[seq].createdAt - 5 * 60 * 1000 > now) {
                delete this.promises[seq];
            }
        })
    }

}
