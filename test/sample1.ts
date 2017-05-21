interface A {
    foo: string;
    bar: number;
}

class C {
    private n: number;
    public m: Date;

    public meth(x: number, y: number): number {
        return x + y
    }
}

class D extends C {

    public meth2(z: string);
    public meth2(z: string, z2:string);
    public meth2(z: string, z2?:string) {
        console.log(z);
    }
}

let c = new C();
let d = new D();

d.m

d.meth2("hello")

import { foo, bar } from "./mod";
foo()
