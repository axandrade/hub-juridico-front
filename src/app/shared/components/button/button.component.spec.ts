import { TestBed } from '@angular/core/testing';

import { ButtonComponent } from './button.component';

describe('ButtonComponent', () => {
  it('monta as classes a partir de variant e size', () => {
    const fixture = TestBed.createComponent(ButtonComponent);
    fixture.componentRef.setInput('variant', 'secondary');
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.className).toContain('btn--secondary');
    expect(button.className).toContain('btn--lg');
  });

  it('emite (clicked) quando habilitado', () => {
    const fixture = TestBed.createComponent(ButtonComponent);
    const spy = vi.fn();
    fixture.componentInstance.clicked.subscribe(spy);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('não emite (clicked) quando desabilitado', () => {
    const fixture = TestBed.createComponent(ButtonComponent);
    const spy = vi.fn();
    fixture.componentRef.setInput('disabled', true);
    fixture.componentInstance.clicked.subscribe(spy);
    fixture.detectChanges();

    fixture.componentInstance['handleClick'](new MouseEvent('click'));
    expect(spy).not.toHaveBeenCalled();
  });
});
