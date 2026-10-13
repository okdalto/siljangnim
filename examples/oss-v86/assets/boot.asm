; Original 16-bit guest for the v86 gallery example.
; Assemble with: nasm -f bin boot.asm -o boot.bin
bits 16
org 0x7c00
cli
xor ax, ax
mov ds, ax
mov ss, ax
mov sp, 0x7c00
sti
cld
mov dx, 0x3f8
%macro serial 1
 mov al, %1
 out dx, al
%endmacro
serial 'V'
serial '8'
serial '6'
serial ' '
serial 'B'
serial 'O'
serial 'O'
serial 'T'
serial ' '
serial 'O'
serial 'K'
serial 10
mov ax, 0x13
int 0x10
mov ax, 0xa000
mov es, ax
xor bx, bx
frame:
 xor di, di
 xor dx, dx
row:
 xor cx, cx
pixel:
 mov ax, cx
 xor ax, dx
 add al, bl
 stosb
 inc cx
 cmp cx, 320
 jl pixel
 inc dx
 cmp dx, 200
 jl row
 inc bl
 jmp frame
times 510-($-$$) db 0
dw 0xaa55
