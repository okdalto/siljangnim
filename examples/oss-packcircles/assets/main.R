library(packcircles)
args <- commandArgs(trailingOnly=TRUE)
out <- args[[1]]
radii <- 0.15 + (seq_len(48) / 48)^1.6
set.seed(17)
orders <- list(seq_len(48), rev(seq_len(48)), sample(seq_len(48)))
for (i in seq_along(orders)) {
 layout <- circleProgressiveLayout(radii[orders[[i]]],sizetype='radius')
 stopifnot(nrow(layout)==48,all(is.finite(as.matrix(layout))),all(layout$radius>0))
 for (a in seq_len(47)) for (b in (a+1):48) {
  distance <- sqrt((layout$x[a]-layout$x[b])^2+(layout$y[a]-layout$y[b])^2)
  stopifnot(distance >= layout$radius[a]+layout$radius[b]-1e-7)
 }
 write.csv(layout,file.path(out,sprintf('circles-%d.csv',i-1)),row.names=FALSE)
}
cat('PASS original packcircles progressive circle packing and all-pairs nonoverlap\n')
