module Main where
import Sound.Tidal.Pattern
import Sound.Tidal.ParseBP
import Data.List (intercalate,sortOn)
import System.Environment (getArgs)
import Control.Monad (unless)

number :: Rational -> String
number x = show (fromRational x :: Double)
eventJSON :: Event String -> String
eventJSON e = "{\"start\":" ++ number (start $ part e) ++ ",\"end\":" ++ number (stop $ part e) ++ ",\"sound\":" ++ show (value e) ++ "}"
main :: IO ()
main = do
 [output] <- getArgs
 let input = "bd [hh hh] sn [hh cp]"
     base = parseBP_E input :: Pattern String
     variants = [("Base pattern",base),("Double speed",fast (pure 2) base),("Reversed cycles",rev base)]
     events p = sortOn (start . part) $ queryArc p (Arc 0 2)
     normal = events base
     doubled = events (fast (pure 2) base)
     mirrored = events (rev $ rev base)
 unless (length normal == 12 && length doubled == 24) (error "Unexpected original pattern event count")
 unless (map eventJSON normal == map eventJSON mirrored) (error "Reversing twice did not restore native events")
 let frame (label,p) = "{\"label\":" ++ show label ++ ",\"events\":[" ++ intercalate "," (map eventJSON $ events p) ++ "]}"
 writeFile output ("{\"engine\":\"TidalCycles tidal-core 1.10.0\",\"pattern\":" ++ show input ++ ",\"cycles\":2,\"doubleReverseVerified\":true,\"frames\":[" ++ intercalate "," (map frame variants) ++ "]}\n")
