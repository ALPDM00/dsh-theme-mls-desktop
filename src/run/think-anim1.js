/* ===========================================================================
 * 思考态视觉：动画1（点阵有机体）
 * -----------------------------------------------------------------------------
 * 数据逐帧取自 D:\PythonCode\ma\动画1.html（21×21 / 141 帧 / 15fps），解码
 * 规则与原文件一致（首帧 RLE，之后每帧是“下标-字符”增量）。这里只保留中央
 * 点阵，不带 720×406 的 HUD 外框 —— 外框在 52px 视觉带里会糊成噪点。
 *
 * 由 src/run/engine-run.js 的 drawThinkBand() 调用：
 *   window.__marThinkAnim.draw(ctx, cx, cy, size, colors, t, reduced)
 *
 * 配色：不引入第二个色系。新生格 = 主题墨色（ink），成熟格 = 同一墨色的低
 * 透明度；在深色 / 浅色两套底下都自动成立（浅底 ink 就是墨）。
 * ========================================================================= */
(function () {
  'use strict';

  var STATES = [[0.337,0.006],[0.340,0.218],[0.406,0.424],[0.350,0.600],[0.350,0.800],[0.350,1.000],[0.450,0.029],[0.538,0.132],[0.463,0.455],[0.451,0.606],[0.517,0.754],[0.514,0.970],[0.620,0.011],[0.612,0.225],[0.697,0.361],[0.788,0.512],[0.752,0.864],[0.608,0.985],[0.816,0.000],[0.754,0.221],[0.817,0.392],[0.842,0.622],[0.850,0.815],[0.908,0.960],[0.978,0.002],[1.026,0.155],[1.039,0.457],[0.997,0.666],[0.953,0.755],[0.995,0.984],[1.001,0.050],[1.049,0.238],[1.054,0.335],[1.023,0.558],[1.003,0.876]];

  var FRAMES = ["64.01m5h.0100m.","64nbm.","64x","64q6o96p96q1","64x6oa6pt6qg","64r6om6qm","5i05k064w6qg","5it5jn5kt64u6qm","4ym5ir5jt5ks64o6ot6px6qt7a9","4ca4d94eb4yt5iv5jx5kp62g66g6os6pw6qn7807at7u27vg7w0","4cn4dt4en4wg4yx50m5iu5jv5ku62t66t6ow6qw78g7an7cm7un7vn7wn","4ct4dr4wt4yv50t5io5ju5ko62v66w6ou6pv6qu78t7ax7cn7ut7vt7wt","4dq4et4yu5jo62u66o6oo6pp6qo7ct8e08gg8i0","3613813qn3rn3tn3un4dw4wr50s62o6po7aw7vn7wy8eg8gt8ig","36t38t3qt3rt3s83tt3ut4cy4dq4ey4ww50w7au7cy7ux7wq8en8in909911921","2l038n3ry3sn3ty4cq4dx4ew4wp50p78y7ao7up7vt7wp8et8gq90n91t92n9l29n0","2l12m12n136x38x3rs3st3tn4cp4dw4eu4wu50u78s7cs7uu7vq7wu8gv8it90t91q92t9lm9nn","2l.2ma2n.36w38w3sw3tr4co4du4eo4wo78q7cq7vu8gu90s91w92s9lt9ma9nt","2n036q38q3rr3su3ts4do4yo50o78p7cu7uo7vo7wo8go90q91p92q9lr9mt9ns","2lb2mg2ng36w38w3qx3rq3so3tq3ux78o7co8ex8iq90w92w9lw9nw","2lt2mt2nt36v3qw3rw3tw3uv8ew8iw90p91u92p9lv","2lr2mx2nr36u38u3qu3ru3tu3uu8ep8ip9mn9nv","2lp2mu2nv36o38o3ro3to8eu8iu90u91o92u9mx","2lu2mo2nu3qo3uo8io90o92o9lu9mw9nu","8eo9mu9no","","","64i","646","64.","","4yw6pw","4yq5jx63a6596pt","4xm4yt4zm5jt63t65t6ot6qt","4xt4zt5g15m862w65n66s6os6ps6qs","4yn5gs5jw5mn62t63q65q66t6ov6pv6qv78n7an7ct","4yx4zn5gy5ha5ii5jp5ki5l25mt63w65w6op6po6qp78t7at7t17uv7wv7x2","4xn4yq5gt5hn5i05ju5k05ln63p65p6m17ar7tm7ut7wt7xm","4924cq4ew4h14xx4yw4zx5gy5hy5i.5jo5k.5ly62s63u65u66r6my6ov6qw6sn7aq7tg7xg8gv","36w38u3qp3st3uu49g4bn4ct4et4fn4hm4wi4xv4yv4zv50i5hx5lq62q63o65o66q6qv6st7tm8gt8h091u","36t37t38t3qt3ut4bt4ft4hn4tg4vs4w.4xu4yu4zu50.51n53b5gr5hw5lw5mx62w6mq6op6qp6sx78n7aw7cy7tn7xn8fm8hg91n","2lx2nw3n03oh3sx3wg3x049n4bs4cs4er4fr4tn4vy4xo4yo4zo51t53n5gw5hu5lu5mq62q66w6mw6ou6qu6sw78s7au7cs7tt7us7ws7xt8ft8ht91q","2lt2nt3nn3ot3sw3wt3xn49t4bx4cx4d04ex4fq4ht4tt4vr51y5gu5ho5lo5mp62w66v6mp6oo6qo6sp7ao7cr7ts7uw7ww7xs8fq8hq91w","20a21n22h3qs3sq3us3xt49x4bq4cq4d.4eq4fw4hx4vx51x53t5mu62p66u6su78r7tx7uu7v07wu7xq8ec8fp8gy8hp8ic8zb91t93b9lt9mo9nta6na8n","20n21t22m3nt3ox3qw3ri3sx3ti3uw3wq49w4bv4cp4ep4hw4vq51q5go5mo62o66o6mu6so78v7cw7tv7uo7v.7wo7xw8e.8fu8gx8hu8i.8zt90c92c93t9ls9nsa6ta7ha8t","22n3op3qp3r.3sq3t.3up3wv49p4bu4co4eo4fu4hp4tn4vv51v53n6mo78u7cu7tp7xp8fo8gr8zn90091x92693y9lw9nwa7t","2ln2nn3ou3qu3sp3uu3wu49u4bo4fo4hu4tw4vu51u53w78o7co7tu7xu8fu8gq8zx90.91v92.93q9lp9m69npa8n","20t22t2lr2mi2ns31136x37s38r3d03ns3so3wo3xy4tu4vo51o53u8gw8zw91u93w9lv9m0a6na8t","2lx2nx31m36v37q38p3dm3xs4to8gu8zp93p9lw9m.9nwa6sa8n","2lq2mc2nq31t36u37v38u3dt3nx3xx8go8zu91o93ua6ra7ya8y","21w2lw2m031x36o37u38o3dr3nw3qo3uo3wu3xw49o4ho53o7to7xo8fo8ho9lv9nva6xa7wa8x","20x21u22q2m.2nw31v37o3dw3nu3wp3xu9lu9nua6pa7ua8p","20p21o22p2lu2np31u3du3no3wu3xo8zo93o9lo9noa6ua7oa8o","20o22u2nu3do3oo3woa6o","","","","","","","","","","641","640","64a","64n","","64w","64u6ot6qx","5jt64o6qt","4yp7907at7b1","4w14xx4yt4zt5016pi79m7bn","4wa4xt5ig5jr5km63i65i79n","4ct4d04en4w850g5it5jv5kt63065.6on6p.6qs78t79m7ct","3su4d84et4wm4yn5ix5ju5kr63.6op6qv79t7bt","37u3st4dm4vu4wt4yt50t51u5gy5hi5ip5kv5li5mn6oo6qo7by7vn","37v4bp4dt4vt4wr4xr4zs50s51t5h65iu5ku5lc5mt5z278x79q7ay7bw7cx7s87vt7y1","3p13v14at4bt4cy4dq4en4ft4gn4ug4wv4xq4zw50w52a5h.5io5l.5ms5z16916mi6si78w79p7aw7bp7cw7sm7vq7yn","2lw2nx37p3ou3pn3vn3wu4ay4cq4du4eq4gs4un4vr4wu4xu4yw4zp50u51n52n5gq5ko5mx5z262666669b6m66s678u79o7au7bo7cu7r17st7ui7vp7wi7yt8cg8dy8jn8km","2lt2nt31o33137t3b13or3py3vt3ws4aw4bx4cw4do4ew4fq4gw4ut4vw4wo4xo4yu4zo50o51w52t5gw5jo5mq5yn5zg62.66.69m6ag6m.6s.78o7ao7co7r27sy7t67u.7vu7w.7x67z28ct8fi8gc8hi8jt8kt","33t36i38i3bn3ot3qc3ss3uc3wt4814ap4bp4fp4gp4i14vp4yo51p5d95mw5p15yt5zt69t6at7rm7t.7vo7x.7zm8f.8g08h.8xn91695m","36c38c3bt3q.3sq3u.48t4av4bo4ev4fu4it4sh4tp4ux4vu51u52x53u5425dm5e05gv5mv5o05pn5yx6ax7rt7yn7zt8cn8g68ky8xt91.95t","20r22t31y3663863dt3ox3px3sp3vy3wr4aw4cp4ep4fo4gq4in4sn4tt4uw4vo51o52v53t54n5dt5em5gu5mo5on5pt5yw5zx69x6aw6in6wn7rw7sx7yx7zw8bn8cr8gc8kr8ln8v89709im9qm","1ft1hn20t2lr2ns31t3603mn3ni3ou3pq3su3vq3wp3xi3ym48s49i4aq4co4eo4gw4hi4ir4up52u54t5et5go5ot5yp5zw69w6av6iy6wt7ru7sp7yp7zo8bt8cx8dr8g68js8kx8lt8vm8zi91093i97m9it9qt","1fn1ht20q22q2lw2nv33s36.37r3803bn3mt3n.3pp3so3vp3wu3x.3yt48q49.4aw4h.4ix4st4tr4uu53s54n5dx5eq5oq5px5zv69v6ap6iw6wq7ro7so7yo8bs8dw8g08jq8kq8ly8vt8xs8z.93095r97t9iq9qqa3gabgapaavm","1fx1hx20v22v2f12ha2lu2nu2ra2t137v38.3by3mw3oo3pu3vo3yw48w4au4gu4iw4tq53q54t5dw5eu5ou5pw5yv5zp69p6av6ip6wu8br8cq8dp8g.8jp8kx8lr8vy8xq91.93.95w97n9ip9l69n09qpa3tabtapmavn","1fq1hw2fy2ht2no2rt2s22tn31y33x37o3br3ds3mu3ou3po3yp48u4ao4go4iu4tv4uo52o53v5dp5eo5oo5pp5yp5zu69u6au6iu6wo8bq8cw8du8jo8kq8lq8vw8xw97q9iu9l.9n.9qua60a7ia86","1fw1u220p21i28g2gy2hr2rr2st31w33w3bw3dw3op3yu4io4sx4to53o54x5du5pu5yu5zo69o6io8bv8cq8do8lv8xv95v97w9io9qoa3xa6.a7ca8.abxapn","1fp1hv1un1vg21022p27a28n2en2fx2gx2hp2lo2rp2sx2tx2un31u33p3bp3du3mo3ou48o4sp54p5do5po5yo6ao6iu6wu8bp8cp8kp8lu8xu95ua3wa7.abpapyavt","1ab1hp1mb1ut1vt20u21.22u27t28t2et2fw2gv2ho2ro2sw2tw31o33u3bo3do3oo3yo4so54o8bo8co8ko8lo8vq8xo95o97qa3uabu","1an1fu1mn1vy20o22o27y28n2ev2fp2gp2sp2tp2uw33o3wo8vw97wa3oaboavr","1hu1mt1ux1vw27v28r2eu2fu2go2so2tu2uu6io6wo8vu97pappavv","1at1uw1vu27u28w2eo2fo2uo8vo97oapoavo","1ar1my1uv1vo27o2to","1aw1fo1ho1mv1uu28u2eu","1au1mo1uo28o2uu","1ao2uo","2eo","64.","","64p","64o","","","5j.64x","5i.5js5k.64.6q.","4x.5ir6466o.6po6qo7c.","4xo5is5jk6406oo7bp7co","4xp4y.4z.5ij5jc5kq64.6oq6pn78.79s7as7bu7c.","4b.4xs5id5j.5kk5m.6ol6qw78u7al7bs7vu","4a.4bo4cw4du4w.4xx4yj4zm5g.5ho5i.5j65kf5lo6on6pt6q.78v79.7am7cs7v.","4ao4bs4cx4dr4ex4u.4ws4xs4yk4zs50s52.5go5hi5j.5kl5l.5mo6o.6qn78s79o7ae7bm7cr7vm","37.3p.3ss3v.4b.4cs4ds4e.4fx4uo4xq4yj4zl51.52o5g.5ht5it5j05k.5lx5m.5o.5zq63e6506oq6q.79r7a.7bn7cs7z.8d.","2l.37o3o.3po3so3vo4ar4bj4dl4ef4gs4wq4x64y64zm50m51o5e.5go5i.5j.5kn5lt5mo5oo5p.5z.61i62m63.65.66t67i69r6o.6p66qt79t7au7cm7wi7zo8c.8do","2lo2ns3oo3s.4bd4c.4em4fk4vr4wm4x74y.4z750s51x5eo5gu5hx5id5k.5mk5po5zp61.62t66q67.69s6p.6qm77u79n7an7b.7dx7r.7ut7wo8co8fs8ho95u","2ls2n.37.3o.3w.4bj4c64ds4f.4gm4v.4wt4x64z.50t51n5g75ht5i75j05me5om5p.62m66y69u6lo6oe6q.6to76o77y79m7at7bt7c.7dt7eo7tn7un7vn7wx7xn7y.8br8ds8fo8hn8jm8x.95.","1f.2l.2nm34o37o39o3ao3m.3oo3so3vx3wo3y.48.4as4b.4cl4dt4ee4f64g.4i.4vq4xd50.52.5d.5es5gd5h65i.5ld5m05oo5y.5zo62n66f69q6kc6lv6o.6w.77l78.79.7ad7b.7cn7ro7s.7to7ut7vm7xs7yu8bu8d.8f.8h.8j.8ls8xo95w","1fo1h.2lm2nx2oo33u34.37w3903a.3bu3d.3mo3ol3ps3st3vm3wl3yo48o4a64bd4c64d.4e64f04gj4io4ss4ts4uq4vy4wm4x.4z750m52n53s54.5do5eo5fm5g75hl5l65m75nt5ox5po5yo5zu62.66.69w6k.6ln6tt6uo6wo76m77.78679f7a.7bf7c67d.7en7r.7ss7tn7u.7w.7xn7y.8br8dk8jk8ku8xs91o95o","2hs2lo2no2o.33s35t37m39.3bs3do3of3pl3sy3wm3yu48w4as4bl4c.4dn4e04f74g64sr4tc4u.4vd4w.4z.50751m52t53k54s5co5dv5em5fx5g.5h.5j.5l.5m65nn5or5pv5y.5zy69o6a.6l.6t.6u.76.78.79.7b.7c.7e.7qn7sy7t.7ve7x.7yq7zr80o8bm8cp8dj8j68ko8l.8x.91.9mxav.","1hs20s2ho2lu2mn31.33m35.37.3oq3s73w73yw48m4a04b04de4e.4fe4gm4is4ss4t.4ug4vy4w750.51e52n53.5c.5ds5ee5f75gf5m05nm5o65pk5yo5zt69n6ao6w.73o74o79d7go7rn7s.7v.7y.7z.80n8b.8c.8de8j08k.8ls8xo91t95.9i.9jo9lo9m.9no9q.a7oabuavo","1fv22s27.2gw2hs2lv2m.2nr2rs31o33d3773bm3lo3mf3om3p03sk3v03wm3ys48.4a.4b.4d.4f.4g.4if4sm4tc4ud4v74w.51752.5cc5d.5e65f.5gd5m.5n.5oc5p65qc5wo5y.5z.69f6a.6wo73.74t79.7ql7re7s07yl7zd89o8be8co8dk8jf8lm8x.91n95u97.9hn9io9k69ln9nn9on9qoa5na7.a9nab.","1f.1hm1m.1vs20l21t22.27o2e.2f.2go2h.2ln2mt2nn2rj2u.33737.3bs3l.3m.3nt3og3p.3s73v.3ww3xn3yd45o4804af4d64i04lo4sp4t04u64vl51052053054m5c65e.5g.5o05p05qo5w.5xn5yd5z66966al6bn6ix6wm7gt7oy7q.7r.7s.7y.7z.80.89.8bs8cs8dm8eg8im8jn8wo8xn8yy91.94n95n96o97s9h.9i.9jy9k.9l.9n.9o.9pna3.a5xa6sap.av.","1fk1h.1mo1u.1v.1xo20m21o22d25i27p2eo2fo2gu2hr2l72mo2n72rk31.33s3be3d.3lr3me3om3pd3s.3vd3we3xf3yq45.48m4a64d.4e04gm4i64l.4sm4t.4u.4v.52.53d54e5ct5d05e05o.5ps5q05wn5xy5y.5z06906a.6bo6cu6il6wl72o73o74o7go7hi7ox82n8b.8c.8de8e.8f08i.8j78kn8ni8vm8w.8xl8ys95d96q97o9im9j.9p.9q7a3ea5.a6.a7ta8na9.abmapjastavk","1hk1ms1ux1ve1xu20l21t22l25q27l28l2e.2gs2h.2l.2mg2n62r02ss2t.2uo33m3b73do3jo3kt3lo3mm3nm3o63p.3v.3w73xn3yu3zt40i45t48.4a.4e.4g.4i74s74t651.53654.5at5cy5dl5e.5p.5qt5ws5y65z.69.6a66bn6cm6hx6i.6l06t66wd72t73t74m7g67hs7io7o.82o88o89q8bk8cl8d.8f.8h78j.8kl8lk8nx8oo8p68vs8wl8xd8y.94.95.96n97m9ei9go9i.9q09soa36a6ea7.ablapxas.av6ben","1f.1hj1mo1us1vs1x.1zo20n22p23e25.27r28.2eo2hm2l02m.2rf2to30o31s3373b.3dt3j.3k.3ly3me3ng3w.3ys3zo40.45i4804im4lt4s.4t.53.5405a.5cm5dm5pf5wo5xx6a76br6cs6ht6i76t06w66xt72q73y74.7g.7ho7it82.88u89.8bl8cm8h08kn8l68n.8or8po8tu8ww8x095696o99o9e.9gt9i09q69s.a2na37a6.a8.absacnapkastavjbbobcnbecbfi","0qo10o1am1f61hc1mm1u.1vf1zf20.21.22.23t27f28f2e.2gk2hl2ie2l.2n.2qm2rm2sf2t.2um31t32d33.3b63c73dn3eo3ju3l.3m.3n.3o.3x.3ym3z.45o48.4i.4lo53n54.5ax5c.5dd5pd5q.5wy5xy5y.6a.6bl6ct6g66i.6l.6t.6w.6xo6yn72o73s7hf7io7mp84p87o88.8b.8c78h68kd8l.8oq8p.8tn8v78wl8x695e96t97s99t9eu9go9i.9q.9st9zoa2ra3mabdap7as.av7b9nbb.bc.be.bf.bhs","0qt0sy0yn10x1as1f71h71mo1ul1ve1zm20t23m27s28l2es2g.2hn2in2l02q62rt2sn2to2uw30n31r3273363b.3c63d.3en3j.3m73yl45.46y4874km4l.4tj53.5ao5d05p.5st5w.5xe6bm6c.6go6w06xm6yo72n73y7ht7in7mn84i87.88n8b08cd8h.8k78oo8vd8wt95.97099n9do9hn9rd9so9vo9z.a2wa3eab.acoapsavfb8nb9.bh.binbjo","0q.0tn0xy0ys10.1em1f61h61it1ms1uo1vs1wn1z020.23026n27.28s2ef2f.2gy2h.2i.2n02q.2rm2s.2t.2us30t31t32l33.3cf3dn3y046n4704804jd4kt4t.5305a.5d.5s.5xd6be6gn6i06w.6xl6yn72m7367hl7im7m.84.88.8bl8c.8k.8o.8tr8vk8wk8x.95096e97l99o9d.9e.9gm9he9k09o09re9sta1ya2la3dabeacmadnap7avmb7ob8.biqbj6bk6","0sl0tx0yn1bl1ef1fl1gm1h.1il1ln1m.1u.1vr1wt1z.20622623.27l28u2e.2g.2hn2l72n.2r.2st2tq2u.30s31.32.3c.3dm3m.47748.4j.4kl53.5x.6966b.6h06i.6w06xe71m72t73e7h.7it7jm8b.8l68tp8v.8w78x095.96n97.99t9h09kj9r09se9v.a1ma2ga3.a70ab.acnaqkautav6b4ob5ob7sbaybgnbi.bjnbk.","0se0te0xd1an1bm1ek1fe1g01it1lt1mt1ul1v.1wf20.22.27.2862gf2h.2l02rl2s.2t.2u730m3d.3em3y.46k47.4j04kd5z069.6g.6h.6w.6x.6y.71e72773.7id7jf8bd8l.8tt8wk8x.96.99n9gn9hf9k69od9r.9sna1ya2fa7.ab0acmadmap1aqtas6av.b4.b5.b6rb7.bbmbftbgfbj.bk0bmo","0qn0sf0t.0x.0yf10n1ad1bl1f.1id1lf1m.1u01v626e2772872f62h02l.2n02r.2se2t72u.2yn30.3e.3gm4604j.4k65w65z.6c071d72e7ik7jn8b.8t.8w.99.9g.9h09k09o09r69s.a0ya1.a2lab.ackad.aeeap.aqdaslaudb40b6.banbbnbfebglbk.bm.","0mt0q70rl0s70ye0zl10m14o18t1a61e71g.1i01ll1ot1u.1v.1wd1x62602702802dt2f.2gm2h.2n.2s.2t02vn2ye2ze3ff3gt46.4k05w.6c671772d7i77j77m683684687l8878pf9h.9k.9o.9r.a0da2dac6aedalyaq.as0au7aznb4nba0bb7bfmbg7bmn","0ny0q.0r70s60y70ze10.13l14t1a.1b01e.1i.1l61te1u01w.1x.26.27.28.29g2dm2g.2s62t.2v72yt2z63f03gl4k.5w671.72.7i.7j.7m77n083084787088.8p7a0la20aelalsas.au.azeb4xba.bb0bc6bf6bg.","0mn0nt0ol0r60sd0z612e13t18n1b.1l.1sl1t71u.2902am2d62s.2ve2yd3d03f.5w.6c.7m07n.83.84687.8p.a00a2.ac.ae0al7azdb4.bb.be0bf.bm.","0m.0nm0od0r.0s.0y.0z012713l14.18l1961n01om1sf1t628029d2af2de2v62y.2z.3d.3f03g.6y67m.84.a0.ae.aleaz7b70bc.be.bj0","0n70o60z.12k13d1861n61o71sk1t.28.2902a62d02v02y03f.3g06y09d09v0al6azdb7e","0n.0o.12.13.18.1901n71o.1s.1t029.2a.2d.2v.2y.3g.6y.9d6ag0al0az0b70bj6","1n.1t.3g09y0ag.al.az.b7.bj.","19.3g.9d.9v.9y.aj0b46","aj.b40bm0"];

  var B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  var SYMBOLS = '#0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var IDX = {};
  for (var i = 1; i < SYMBOLS.length; i++) IDX[SYMBOLS[i]] = i - 1;

  function rleFull(s) {
    var out = [];
    for (var i = 0; i < s.length; i += 3) {
      var n = B36.indexOf(s[i]) * 36 + B36.indexOf(s[i + 1]);
      var c = s[i + 2];
      for (var j = 0; j < n; j++) out.push(c);
    }
    return out;
  }

  var CELLS = null;
  function ensureCells() {
    if (CELLS) return CELLS;
    var all = [];
    var cur = rleFull(FRAMES[0]);
    all.push(cur);
    for (var f = 1; f < FRAMES.length; f++) {
      var s = FRAMES[f];
      var nx = cur.slice();
      for (var i = 0; i < s.length; i += 3) {
        nx[B36.indexOf(s[i]) * 36 + B36.indexOf(s[i + 1])] = s[i + 2];
      }
      all.push(nx);
      cur = nx;
    }
    CELLS = all;
    return CELLS;
  }

  var N = 21;
  var FPS = 15;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // 每一格“第一次亮起”的帧号：用来做逐格淡入（不再依赖预先铺满的点阵底）。
  var BORN = null;
  function ensureBorn() {
    if (BORN) return BORN;
    var cellsAll = ensureCells();
    var born = new Array(N * N);
    for (var i = 0; i < born.length; i++) born[i] = -1;
    for (var f = 0; f < cellsAll.length; f++) {
      var cells = cellsAll[f];
      for (var k = 0; k < cells.length; k++) {
        if (cells[k] !== '.' && born[k] < 0) born[k] = f;
      }
    }
    BORN = born;
    return born;
  }

  /* draw(c, cx, cy, size, t, reduced)
   *   size  : 方形边长（CSS px），由调用方按宿主空间决定
   *   t     : 秒；从 0 开始 = 从“一格都没有”开始生长
   *   没有底板、没有边框、没有静态格子：不亮的格子直接不存在。
   *   颜色固定（2026-11-05 用户要求，不跟主题色）：
   *     新生格 = #C0FE04（酸绿，闪一下），成熟格 = #8F96B2（原来的蓝灰）。
   *   每格的最终色按 STATES 的 warm 值在两者之间插值 —— 绿会自然退成蓝灰。 */
  var FRESH = [0xC0, 0xFE, 0x04];
  var MATURE = [0x8F, 0x96, 0xB2];

  // 把 #rgb / #rrggbb / rgb(...) 解析成 [r,g,b]；解析失败返回 null。
  function parseColor(value) {
    if (!value) return null;
    var s = String(value).trim();
    var m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
    if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
    return null;
  }

  function mixColor(a, b, t) {
    var r = Math.round(a[0] + (b[0] - a[0]) * t);
    var g = Math.round(a[1] + (b[1] - a[1]) * t);
    var bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function draw(c, cx, cy, size, t, reduced, freshCss) {
    var cellsAll = ensureCells();
    var born = ensureBorn();
    var fresh = parseColor(freshCss) || FRESH;
    var half = size / 2;
    var pitch = size / N;
    var dot = Math.max(1, pitch * 0.74);
    var pad = (pitch - dot) / 2;
    var total = cellsAll.length;
    var fi = reduced ? (42 % total) : (Math.floor(t * FPS) % total);
    var cells = cellsAll[fi];
    var fadeFrames = 8;

    c.save();
    for (var k = 0; k < cells.length; k++) {
      var sym = cells[k];
      if (sym === '.') continue;
      var st = STATES[IDX[sym]];
      if (!st) continue;
      var a = clamp01(st[0]);
      if (a <= 0.01) continue;
      // 这一格第一次亮起后的 8 帧内从 0 淡到目标亮度 —— “逐渐显示”。
      var b = born[k];
      var grow = b < 0 ? 1 : clamp01((fi - b + 1) / fadeFrames);
      if (grow <= 0) continue;
      var warm = clamp01(st[1]);            // 1 = 新生（绿），0 = 成熟（蓝灰）
      var x = cx - half + (k % N) * pitch + pad;
      var y = cy - half + ((k / N) | 0) * pitch + pad;
      c.globalAlpha = a * grow;
      c.fillStyle = mixColor(MATURE, fresh, warm);
      c.fillRect(x, y, dot, dot);
    }
    c.restore();
    c.globalAlpha = 1;
  }

  window.__marThinkAnim = { draw: draw, version: '3.0.0' };
})();
