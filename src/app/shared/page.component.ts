import { Component, Input } from '@angular/core';
@Component({selector:'app-page',standalone:true,template:`<div class="page-head"><div><span class="eyebrow">{{eyebrow}}</span><h2>{{title}}</h2><p>{{description}}</p></div><div class="page-actions"><ng-content select="[actions]"></ng-content></div></div>`})
export class PageComponent { @Input() title=''; @Input() description=''; @Input() eyebrow='ADMINISTRATION'; }
