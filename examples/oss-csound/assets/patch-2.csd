<CsoundSynthesizer>
<CsOptions>
-d -m0 -W -s -o out/audio-2.wav
</CsOptions>
<CsInstruments>
sr = 48000
ksmps = 32
nchnls = 1
0dbfs = 1
instr 1
 aenv linseg 0, 0.02, 0.5, p3-0.22, 0.5, 0.2, 0
 asig foscil aenv, 220, 1, 2, p4, 1
 out asig
endin
</CsInstruments>
<CsScore>
f 1 0 16384 10 1
i 1 0 2 5
e
</CsScore>
</CsoundSynthesizer>
